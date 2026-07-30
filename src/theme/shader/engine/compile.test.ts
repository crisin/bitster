import { describe, expect, it } from "vitest";
import { TRIP_PRESETS } from "../advanced";
import { PRELUDE } from "../prelude";
import {
  assemblePass,
  mapErrorToUserLines,
  specFromSimple,
  specFromUserShader,
  validateSpec,
  withGuard,
} from "./compile";
import {
  GUARD_BUFFER,
  MAX_FIXED_HEIGHT,
  MAX_PASSES,
  MIN_FIXED_HEIGHT,
} from "./types";

const MAIN = "void main() { gl_FragColor = vec4(1.0); }";

describe("validateSpec", () => {
  it("accepts the trivial single-pass spec", () => {
    expect(validateSpec(specFromSimple("x", MAIN))).toEqual([]);
  });

  it("accepts every trip preset", () => {
    // The trip specs are data, not code — a typo in a buffer name would
    // otherwise only surface as a black screen on somebody's GPU
    for (const preset of TRIP_PRESETS) {
      expect(validateSpec(preset.spec), preset.id).toEqual([]);
    }
  });

  it("has no id collisions between trip and simple presets", () => {
    const ids = TRIP_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects a spec that never reaches the screen", () => {
    const errors = validateSpec({
      id: "x",
      passes: [{ target: "buf", source: MAIN }],
    });
    expect(errors.join()).toMatch(/screen/);
  });

  it("rejects work scheduled after the screen pass", () => {
    const errors = validateSpec({
      id: "x",
      passes: [
        { target: "screen", source: MAIN },
        { target: "buf", source: MAIN },
      ],
    });
    expect(errors.join()).toMatch(/last/);
  });

  it("rejects reading an unknown buffer and reading yourself", () => {
    expect(
      validateSpec({
        id: "x",
        passes: [{ target: "screen", source: MAIN, inputs: ["ghost"] }],
      }).join(),
    ).toMatch(/unknown buffer/);
    expect(
      validateSpec({
        id: "x",
        passes: [
          { target: "buf", source: MAIN, inputs: ["buf"] },
          { target: "screen", source: MAIN },
        ],
      }).join(),
    ).toMatch(/feedback/);
  });

  it("rejects iterations without feedback — they would grind one frame", () => {
    const errors = validateSpec({
      id: "x",
      passes: [
        { target: "buf", source: MAIN, iterations: 4 },
        { target: "screen", source: MAIN },
      ],
    });
    expect(errors.join()).toMatch(/feedback/);
  });

  it("rejects buffer names that shadow prelude uniforms", () => {
    const errors = validateSpec({
      id: "x",
      passes: [
        { target: "sim", source: MAIN, feedback: true },
        { target: "screen", source: MAIN, inputs: ["sim"] },
      ],
    });
    expect(errors.join()).toMatch(/u_sim/);
  });

  it("bounds fixedHeight — a sim grid must stay a sim grid", () => {
    const sim = (fixedHeight: number) =>
      validateSpec({
        id: "x",
        passes: [
          { target: "buf", source: MAIN, feedback: true, fixedHeight },
          { target: "screen", source: MAIN, inputs: ["buf"] },
        ],
      });
    expect(sim(220)).toEqual([]);
    expect(sim(MIN_FIXED_HEIGHT - 1).join()).toMatch(/fixedHeight/);
    expect(sim(MAX_FIXED_HEIGHT + 1).join()).toMatch(/fixedHeight/);
  });

  it("rejects the reserved guard buffer and too many passes", () => {
    expect(
      validateSpec({
        id: "x",
        passes: [
          { target: GUARD_BUFFER, source: MAIN },
          { target: "screen", source: MAIN },
        ],
      }).join(),
    ).toMatch(/reserved/);

    const passes = Array.from({ length: MAX_PASSES + 1 }, (_, i) => ({
      target: i === MAX_PASSES ? "screen" : `b${i}`,
      source: MAIN,
    }));
    expect(validateSpec({ id: "x", passes }).join()).toMatch(/Too many/);
  });
});

describe("assemblePass", () => {
  it("prepends the prelude and the declared samplers", () => {
    const assembled = assemblePass({
      target: "screen",
      source: MAIN,
      feedback: true,
      inputs: ["trail"],
    });
    expect(assembled.fragment).toContain(PRELUDE);
    expect(assembled.fragment).toContain("uniform sampler2D u_prev;");
    expect(assembled.fragment).toContain("uniform sampler2D u_trail;");
    expect(assembled.fragment.endsWith(MAIN)).toBe(true);
  });

  it("reports the exact number of prepended lines", () => {
    const source = "line1\nline2\nvoid main() {}";
    const assembled = assemblePass({ target: "screen", source });
    const lines = assembled.fragment.split("\n");
    // The author's first line must sit exactly at offset + 1 (1-indexed)
    expect(lines[assembled.userLineOffset]).toBe("line1");
  });
});

describe("mapErrorToUserLines", () => {
  it("shifts driver line numbers back into the author's file", () => {
    const mapped = mapErrorToUserLines(
      "ERROR: 0:57: 'foo' : undeclared identifier",
      50,
    );
    expect(mapped).toContain("line 7");
    expect(mapped).not.toContain("0:57");
  });

  it("never reports a line below 1 and keeps unknown formats intact", () => {
    expect(mapErrorToUserLines("ERROR: 0:3: bad", 50)).toContain("line 1");
    expect(mapErrorToUserLines("something exotic", 10)).toBe(
      "something exotic",
    );
  });
});

describe("specFromUserShader", () => {
  it("wraps a feedback shader in buffer + present", () => {
    const spec = specFromUserShader({ id: "abc", source: MAIN, feedback: true });
    expect(spec.passes).toHaveLength(2);
    expect(spec.passes[0].feedback).toBe(true);
    expect(spec.passes[1].target).toBe("screen");
    expect(validateSpec(spec)).toEqual([]);
  });

  it("keeps a plain shader single-pass", () => {
    const spec = specFromUserShader({ id: "abc", source: MAIN, feedback: false });
    expect(spec.passes).toHaveLength(1);
    expect(validateSpec(spec)).toEqual([]);
  });
});

describe("withGuard", () => {
  it("reroutes the screen pass and appends the tone-map", () => {
    const spec = withGuard(specFromSimple("x", MAIN));
    expect(spec.passes).toHaveLength(2);
    expect(spec.passes[0].target).toBe(GUARD_BUFFER);
    expect(spec.passes[1].target).toBe("screen");
    expect(spec.passes[1].inputs).toEqual([GUARD_BUFFER]);
    // The guarded spec must still be a valid spec in its own right
    expect(
      validateSpec(spec).filter((e) => !e.includes("reserved")),
    ).toEqual([]);
  });

  it("guards every trip preset without breaking it", () => {
    for (const preset of TRIP_PRESETS) {
      const guarded = withGuard(preset.spec);
      expect(guarded.passes.length).toBe(preset.spec.passes.length + 1);
      expect(guarded.passes[guarded.passes.length - 1].target).toBe("screen");
    }
  });
});
