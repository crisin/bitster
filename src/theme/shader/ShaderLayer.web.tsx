import React, { useEffect, useRef } from "react";
import { log } from "@/utils/logger";
import type { ShaderPresetId } from "./presets";
import { FRAGMENT_SHADERS, VERTEX_SHADER } from "./presets";

/**
 * A full-screen WebGL canvas that runs one fragment shader.
 *
 * react-native-web renders through React DOM, so a plain <canvas> is just
 * another host element — no bridge, no wrapper, no extra dependency. And a
 * fullscreen fragment shader needs no scene graph, so there is no three.js
 * here either: one triangle covering the viewport, and a function that decides
 * the colour of every pixel.
 */

export interface ShaderLayerProps {
  preset: ShaderPresetId;
  /** Accent colour as #rrggbb */
  accent: string;
  /** 0..1 — feeds the shader and drives how loud it is */
  intensity: number;
  /** Backing-store scale: the single biggest performance lever */
  renderScale: number;
  /** Effect speed multiplier */
  factor: number;
  /** Tapped tempo, or null when no beat is set */
  bpm: number | null;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const int = Number.parseInt(full, 16);
  if (!Number.isFinite(int)) return [1, 1, 1];
  return [
    ((int >> 16) & 255) / 255,
    ((int >> 8) & 255) / 255,
    (int & 255) / 255,
  ];
}

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
  );
}

function compile(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    log.error("theme", `Shader failed: ${gl.getShaderInfoLog(shader) ?? "?"}`);
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function buildProgram(
  gl: WebGLRenderingContext,
  fragment: string,
): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  // The shaders are owned by the program once linked
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    log.error("theme", `Program link failed: ${gl.getProgramInfoLog(program) ?? "?"}`);
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

/**
 * How loud the beat is right now: a sharp spike on each beat that decays, so
 * effects punch on the downbeat instead of wobbling. Without a tapped tempo it
 * falls back to slow breathing.
 */
function beatAt(elapsedMs: number, bpm: number | null, factor: number): number {
  if (bpm === null) {
    return 0.5 + 0.5 * Math.sin((elapsedMs / 1000) * factor * 1.2);
  }
  const beatMs = 60000 / bpm;
  const phase = (elapsedMs % beatMs) / beatMs;
  return Math.pow(1 - phase, 3);
}

export function ShaderLayer({
  preset,
  accent,
  intensity,
  renderScale,
  factor,
  bpm,
}: ShaderLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Values the render loop reads every frame — kept in a ref so a settings
  // change never tears down and recompiles the program
  const live = useRef({ accent, intensity, factor, bpm });
  live.current = { accent, intensity, factor, bpm };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: "low-power",
      desynchronized: true,
    });
    if (!gl) {
      log.warn("theme", "No WebGL context — shader layer stays off");
      return;
    }

    const program = buildProgram(gl, FRAGMENT_SHADERS[preset]);
    if (!program) return;

    // One triangle big enough to cover the viewport beats a two-triangle quad:
    // fewer vertices and no seam down the diagonal
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const posLoc = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(program);

    const uRes = gl.getUniformLocation(program, "u_res");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uBeat = gl.getUniformLocation(program, "u_beat");
    const uIntensity = gl.getUniformLocation(program, "u_intensity");
    const uAccent = gl.getUniformLocation(program, "u_accent");
    const uGame = gl.getUniformLocation(program, "u_game");

    let width = 0;
    let height = 0;
    const resize = () => {
      const cssW = canvas.clientWidth || window.innerWidth;
      const cssH = canvas.clientHeight || window.innerHeight;
      // Deliberately NOT devicePixelRatio: a phone at 3x would render nine
      // times the pixels for an effect nobody looks at that closely
      const w = Math.max(1, Math.round(cssW * renderScale));
      const h = Math.max(1, Math.round(cssH * renderScale));
      if (w === width && h === height) return;
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    };
    resize();
    window.addEventListener("resize", resize);

    // Accumulated, not derived from wall clock: a speed change must not make
    // the animation jump, and neither must a backgrounded tab
    let shaderTime = 0;
    let lastFrame = 0;
    let elapsed = 0;
    let frame = 0;
    let lost = false;
    const still = reducedMotion();

    const draw = (now: number) => {
      if (lost) return;
      const dt = lastFrame === 0 ? 0 : Math.min(100, now - lastFrame);
      lastFrame = now;
      const { accent: hex, intensity: amount, factor: speed, bpm: tempo } =
        live.current;
      shaderTime += (dt / 1000) * speed;
      elapsed += dt;

      resize();
      gl.uniform2f(uRes, width, height);
      gl.uniform1f(uTime, shaderTime);
      gl.uniform1f(uBeat, still ? 0 : beatAt(elapsed, tempo, speed));
      gl.uniform1f(uIntensity, amount);
      const [r, g, b] = hexToRgb(hex);
      gl.uniform3f(uAccent, r, g, b);
      // Stage two fills this in; zero means "no game context"
      gl.uniform3f(uGame, 0, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (!still) frame = requestAnimationFrame(draw);
    };

    // Mobile browsers drop the context when the app is backgrounded; without
    // preventDefault the canvas never comes back
    const onLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      if (frame) cancelAnimationFrame(frame);
    };
    const onRestored = () => {
      lost = false;
      lastFrame = 0;
      frame = requestAnimationFrame(draw);
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);

    frame = requestAnimationFrame(draw);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
    // Only a different preset or resolution justifies rebuilding the pipeline
  }, [preset, renderScale]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        // Screen-blend so it lights the UI up instead of veiling it — text
        // stays readable even at full intensity
        mixBlendMode: "screen",
        opacity: 0.25 + intensity * 0.55,
      }}
    />
  );
}
