import { VERTEX_SHADER } from "../prelude";
import { assemblePass, mapErrorToUserLines } from "./compile";
import type { EffectSpec, EngineUniforms, PassSpec } from "./types";

/**
 * The WebGL half of the multi-pass engine. Owns programs, framebuffers and
 * the frame loop's inner work — and nothing else: no React, no store, no
 * request-animation-frame. The ShaderLayer drives it.
 *
 * WebGL 1 on purpose, same as the presets: it runs everywhere, and feedback
 * only needs framebuffers, which GL 1 has. Half-float sim buffers are an
 * extension probe with a byte fallback — worse-looking, never crashing.
 */

export class EngineBuildError extends Error {
  constructor(
    message: string,
    /** Index of the failing pass in the spec */
    readonly passIndex: number,
  ) {
    super(message);
  }
}

interface Target {
  /** Sampled by readers this frame */
  read: WebGLTexture;
  readFbo: WebGLFramebuffer;
  /** Written by its pass, then swapped */
  write: WebGLTexture;
  writeFbo: WebGLFramebuffer;
  scale: number;
  half: boolean;
  width: number;
  height: number;
}

interface CompiledPass {
  spec: PassSpec;
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation>;
}

/** Cached: whether this context can render into half-float textures */
function probeHalfFloat(gl: WebGLRenderingContext): number | null {
  const ext = gl.getExtension("OES_texture_half_float") as {
    HALF_FLOAT_OES: number;
  } | null;
  if (!ext) return null;
  // The extension existing does not mean the texture is renderable — ask
  const tex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, ext.HALF_FLOAT_OES, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const complete =
    gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
  gl.deleteTexture(tex);
  return complete ? ext.HALF_FLOAT_OES : null;
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): { shader: WebGLShader } | { error: string } {
  const shader = gl.createShader(type);
  if (!shader) return { error: "createShader failed" };
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "unknown shader error";
    gl.deleteShader(shader);
    return { error: log };
  }
  return { shader };
}

/**
 * Compile ONE fragment source against a context and report the error mapped
 * to the author's line numbers — the Studio's live syntax check.
 */
export function checkFragment(
  gl: WebGLRenderingContext,
  pass: PassSpec,
): string | null {
  const assembled = assemblePass(pass);
  const result = compileShader(gl, gl.FRAGMENT_SHADER, assembled.fragment);
  if ("error" in result) {
    return mapErrorToUserLines(result.error, assembled.userLineOffset);
  }
  gl.deleteShader(result.shader);
  return null;
}

export class ShaderEngine {
  private readonly passes: CompiledPass[] = [];
  private readonly targets = new Map<string, Target>();
  private readonly buffer: WebGLBuffer;
  private readonly halfFloatType: number | null;
  private frame = 0;
  private width = 0;
  private height = 0;

  constructor(
    private readonly gl: WebGLRenderingContext,
    spec: EffectSpec,
  ) {
    this.halfFloatType = probeHalfFloat(gl);

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    if ("error" in vs) throw new EngineBuildError(vs.error, -1);

    // One fullscreen triangle shared by every pass
    const buffer = gl.createBuffer();
    if (!buffer) throw new EngineBuildError("createBuffer failed", -1);
    this.buffer = buffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );

    for (const [index, passSpec] of spec.passes.entries()) {
      const assembled = assemblePass(passSpec);
      const fs = compileShader(gl, gl.FRAGMENT_SHADER, assembled.fragment);
      if ("error" in fs) {
        throw new EngineBuildError(
          mapErrorToUserLines(fs.error, assembled.userLineOffset),
          index,
        );
      }
      const program = gl.createProgram();
      if (!program) throw new EngineBuildError("createProgram failed", index);
      gl.attachShader(program, vs.shader);
      gl.attachShader(program, fs.shader);
      gl.linkProgram(program);
      gl.deleteShader(fs.shader);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program) ?? "link failed";
        gl.deleteProgram(program);
        throw new EngineBuildError(log, index);
      }
      const posLoc = gl.getAttribLocation(program, "a_pos");
      gl.useProgram(program);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      // Cache every uniform the program actually kept after optimization
      const uniforms = new Map<string, WebGLUniformLocation>();
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(program, i);
        if (!info) continue;
        const loc = gl.getUniformLocation(program, info.name);
        if (loc) uniforms.set(info.name, loc);
      }

      this.passes.push({ spec: passSpec, program, uniforms });

      if (passSpec.target !== "screen") {
        this.createTarget(passSpec);
      }
    }
    gl.deleteShader(vs.shader);
  }

  private createTarget(pass: PassSpec): void {
    const gl = this.gl;
    const half = pass.precision === "high" && this.halfFloatType !== null;
    const make = (): { tex: WebGLTexture; fbo: WebGLFramebuffer } => {
      const tex = gl.createTexture();
      const fbo = gl.createFramebuffer();
      if (!tex || !fbo) throw new EngineBuildError("target alloc failed", -1);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      // Sims sample exact texels (NEAREST is correct); everything visual
      // wants LINEAR for smooth feedback zooms
      const filter = half ? gl.NEAREST : gl.LINEAR;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return { tex, fbo };
    };
    const a = make();
    const b = make();
    this.targets.set(pass.target, {
      read: a.tex,
      readFbo: a.fbo,
      write: b.tex,
      writeFbo: b.fbo,
      scale: pass.scale ?? 1,
      half,
      width: 0,
      height: 0,
    });
  }

  /** (Re)allocate every buffer for a new canvas size. Also reseeds (frame 0). */
  resize(width: number, height: number): void {
    const gl = this.gl;
    this.width = width;
    this.height = height;
    for (const target of this.targets.values()) {
      target.width = Math.max(1, Math.round(width * target.scale));
      target.height = Math.max(1, Math.round(height * target.scale));
      const type =
        target.half && this.halfFloatType !== null
          ? this.halfFloatType
          : gl.UNSIGNED_BYTE;
      for (const tex of [target.read, target.write]) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(
          gl.TEXTURE_2D, 0, gl.RGBA,
          target.width, target.height, 0,
          gl.RGBA, type, null,
        );
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.readFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.read, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.writeFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.write, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // Feedback buffers are blank now — passes re-seed via u_frame < 1
    this.frame = 0;
  }

  render(u: EngineUniforms): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);

    for (const pass of this.passes) {
      const iterations = pass.spec.iterations ?? 1;
      const target = this.targets.get(pass.spec.target) ?? null;

      for (let i = 0; i < iterations; i++) {
        if (target) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, target.writeFbo);
          gl.viewport(0, 0, target.width, target.height);
        } else {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, this.width, this.height);
        }

        gl.useProgram(pass.program);
        const posLoc = gl.getAttribLocation(pass.program, "a_pos");
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        const set = pass.uniforms;
        const loc = (name: string) => set.get(name) ?? null;
        const uRes = loc("u_res");
        if (uRes)
          gl.uniform2f(
            uRes,
            target ? target.width : this.width,
            target ? target.height : this.height,
          );
        const uTime = loc("u_time");
        if (uTime) gl.uniform1f(uTime, u.time);
        const uBeat = loc("u_beat");
        if (uBeat) gl.uniform1f(uBeat, u.beat);
        const uIntensity = loc("u_intensity");
        if (uIntensity) gl.uniform1f(uIntensity, u.intensity);
        const uAccent = loc("u_accent");
        if (uAccent) gl.uniform3f(uAccent, u.accent[0], u.accent[1], u.accent[2]);
        const uGame = loc("u_game");
        if (uGame) gl.uniform3f(uGame, u.game[0], u.game[1], u.game[2]);
        const uFrame = loc("u_frame");
        if (uFrame) gl.uniform1f(uFrame, this.frame);
        const uPointer = loc("u_pointer");
        if (uPointer)
          gl.uniform4f(
            uPointer,
            u.pointer[0], u.pointer[1], u.pointer[2], u.pointer[3],
          );

        // Texture bindings: u_prev = own read side, u_<name> = that buffer's
        // read side. Reading and writing the same texture would be undefined
        // behaviour — the ping-pong split is what makes feedback legal.
        let unit = 0;
        if (pass.spec.feedback && target) {
          const uPrev = loc("u_prev");
          if (uPrev) {
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, target.read);
            gl.uniform1i(uPrev, unit);
            unit++;
          }
        }
        for (const input of pass.spec.inputs ?? []) {
          const uIn = loc(`u_${input}`);
          const inputTarget = this.targets.get(input);
          if (uIn && inputTarget) {
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, inputTarget.read);
            gl.uniform1i(uIn, unit);
            unit++;
          }
        }

        gl.drawArrays(gl.TRIANGLES, 0, 3);

        if (target) {
          // What was written becomes what readers (and u_prev) see next
          const t = target.read;
          const f = target.readFbo;
          target.read = target.write;
          target.readFbo = target.writeFbo;
          target.write = t;
          target.writeFbo = f;
        }
      }
    }
    this.frame++;
  }

  dispose(): void {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    for (const pass of this.passes) gl.deleteProgram(pass.program);
    for (const target of this.targets.values()) {
      gl.deleteTexture(target.read);
      gl.deleteTexture(target.write);
      gl.deleteFramebuffer(target.readFbo);
      gl.deleteFramebuffer(target.writeFbo);
    }
    gl.deleteBuffer(this.buffer);
  }
}
