import { PRELUDE } from "../prelude";
import {
  BUFFER_NAME_RE,
  GUARD_BUFFER,
  MAX_ITERATIONS,
  MAX_PASSES,
  MAX_SOURCE_LENGTH,
  type EffectSpec,
  type PassSpec,
} from "./types";

/**
 * The pure half of the engine: spec validation, GLSL assembly and error-line
 * mapping. Everything here is testable without a GPU — the WebGL half
 * (engine.web.ts) only executes what this module has already shaped.
 */

/** Human-readable problems; an empty array means the spec is runnable */
export function validateSpec(spec: EffectSpec): string[] {
  const errors: string[] = [];
  if (spec.passes.length === 0) errors.push("No passes");
  if (spec.passes.length > MAX_PASSES)
    errors.push(`Too many passes (max ${MAX_PASSES})`);

  const buffers = new Set<string>();
  for (const pass of spec.passes) {
    if (pass.target !== "screen") {
      if (!BUFFER_NAME_RE.test(pass.target)) {
        errors.push(`Bad buffer name "${pass.target}"`);
      } else if (pass.target === GUARD_BUFFER) {
        errors.push(`"${GUARD_BUFFER}" is reserved for the readability guard`);
      } else if (buffers.has(pass.target)) {
        errors.push(`Two passes write "${pass.target}"`);
      }
      buffers.add(pass.target);
    }
    if (pass.source.length > MAX_SOURCE_LENGTH) {
      errors.push(`Pass "${pass.target}" source too long`);
    }
    if (!pass.source.includes("main")) {
      errors.push(`Pass "${pass.target}" has no main()`);
    }
    if (pass.feedback && pass.target === "screen") {
      errors.push("The screen pass cannot be a feedback buffer");
    }
    const iterations = pass.iterations ?? 1;
    if (iterations < 1 || iterations > MAX_ITERATIONS) {
      errors.push(`Pass "${pass.target}" iterations out of range`);
    }
    if (iterations > 1 && !pass.feedback) {
      errors.push(`Pass "${pass.target}" iterates but has no feedback buffer`);
    }
    const scale = pass.scale ?? 1;
    if (!(scale > 0 && scale <= 1)) {
      errors.push(`Pass "${pass.target}" scale out of range`);
    }
  }

  // The last pass must hit the screen, and only the last — anything after it
  // would be invisible work
  const screenAt = spec.passes.findIndex((p) => p.target === "screen");
  if (screenAt === -1) errors.push("No pass renders to the screen");
  else if (screenAt !== spec.passes.length - 1)
    errors.push("The screen pass must come last");

  for (const pass of spec.passes) {
    for (const input of pass.inputs ?? []) {
      if (!buffers.has(input)) {
        errors.push(`Pass "${pass.target}" reads unknown buffer "${input}"`);
      }
      if (input === pass.target) {
        errors.push(
          `Pass "${pass.target}" reads itself — use feedback/u_prev instead`,
        );
      }
    }
  }
  return errors;
}

export interface AssembledPass {
  fragment: string;
  /** Lines in front of the author's source — subtract to map error lines */
  userLineOffset: number;
}

/** Prelude + per-pass samplers + the author's source, ready to compile */
export function assemblePass(pass: PassSpec): AssembledPass {
  let decls = "";
  if (pass.feedback) decls += "uniform sampler2D u_prev;\n";
  for (const input of pass.inputs ?? []) {
    decls += `uniform sampler2D u_${input};\n`;
  }
  const head = PRELUDE + decls;
  return {
    fragment: head + pass.source,
    // -1: the head's trailing newline and the source's first line share a count
    userLineOffset: head.split("\n").length - 1,
  };
}

/**
 * WebGL info logs say "ERROR: 0:57: ..." counting the ASSEMBLED file. The
 * author wrote line 7 — this maps the numbers back so the Studio can point
 * at the line they can actually see.
 */
export function mapErrorToUserLines(
  infoLog: string,
  userLineOffset: number,
): string {
  return infoLog
    .replace(/\b(?:ERROR|WARNING):\s*0:(\d+)/g, (match, line: string) => {
      const mapped = Number.parseInt(line, 10) - userLineOffset;
      return match.replace(`0:${line}`, `line ${Math.max(1, mapped)}`);
    })
    .trim();
}

/** A classic single-pass preset as the trivial spec */
export function specFromSimple(id: string, source: string): EffectSpec {
  return { id, passes: [{ target: "screen", source }] };
}

/**
 * A Studio shader as a spec. With feedback on, the author's code renders into
 * a persistent buffer (u_prev available) and a generated present pass copies
 * it to the screen — real video feedback from a single editor field.
 */
export function specFromUserShader(user: {
  id: string;
  source: string;
  feedback: boolean;
}): EffectSpec {
  const source = user.source.slice(0, MAX_SOURCE_LENGTH);
  if (!user.feedback) {
    return { id: `user:${user.id}`, passes: [{ target: "screen", source }] };
  }
  return {
    id: `user:${user.id}`,
    passes: [
      { target: "canvas_fb", source, feedback: true },
      {
        target: "screen",
        inputs: ["canvas_fb"],
        source:
          "void main() {\n" +
          "  gl_FragColor = texture2D(u_canvas_fb, gl_FragCoord.xy / u_res);\n" +
          "}\n",
      },
    ],
  };
}

/**
 * The readability guard: reroute the screen pass into a buffer and append a
 * tone-map. What actually eats text under a screen-blended layer is not peak
 * highlights but large bright AREAS — a huge reaction-diffusion blob lifts
 * the whole background, while a thin spark line never hurt anyone. So the
 * map keys on the brightness of a wide neighbourhood: big features dim hard,
 * fine detail keeps its punch.
 */
export function withGuard(spec: EffectSpec): EffectSpec {
  const passes = [...spec.passes];
  const screen = passes[passes.length - 1];
  if (!screen || screen.target !== "screen") return spec;

  passes[passes.length - 1] = { ...screen, target: GUARD_BUFFER };
  passes.push({
    target: "screen",
    inputs: [GUARD_BUFFER],
    source:
      "float guardLuma(vec2 uv) {\n" +
      `  return dot(texture2D(u_${GUARD_BUFFER}, uv).rgb, vec3(0.2126, 0.7152, 0.0722));\n` +
      "}\n" +
      "void main() {\n" +
      "  vec2 uv = gl_FragCoord.xy / u_res;\n" +
      `  vec3 c = texture2D(u_${GUARD_BUFFER}, uv).rgb;\n` +
      "  // Brightness of the SURROUNDINGS, not the pixel: a wide 5-tap cross.\n" +
      "  // Inside a big blob every tap is hot; on a thin line most are dark.\n" +
      "  float area = guardLuma(uv);\n" +
      "  area += guardLuma(uv + vec2(0.025, 0.0));\n" +
      "  area += guardLuma(uv - vec2(0.025, 0.0));\n" +
      "  area += guardLuma(uv + vec2(0.0, 0.025));\n" +
      "  area += guardLuma(uv - vec2(0.0, 0.025));\n" +
      "  area /= 5.0;\n" +
      "  // Soft-cap: dark regions pass (factor ~1), a solid bright area drops\n" +
      "  // to roughly a quarter — text stays legible on top of anything\n" +
      "  gl_FragColor = vec4(c * (0.3 / (0.3 + area)), 1.0);\n" +
      "}\n",
  });
  return { id: spec.id, passes };
}

