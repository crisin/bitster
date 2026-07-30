import type { GamePulse } from "@/hooks/useGamePulse";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { log } from "@/utils/logger";
import { EngineBuildError, ShaderEngine } from "./engine/engine.web";
import { validateSpec, withGuard } from "./engine/compile";
import type { EffectSpec } from "./engine/types";
import {
  IDLE_POINTER,
  pointerUniform,
  reactToGame,
  type PointerState,
} from "./reaction";
import { resolveShaderSpec } from "./resolve";
import { useShaderStudioStore } from "./studio";

/**
 * A full-screen WebGL canvas driven by the multi-pass ShaderEngine.
 *
 * react-native-web renders through React DOM, so a plain <canvas> is just
 * another host element — no bridge, no wrapper, no extra dependency. This
 * component owns the React concerns (canvas lifecycle, context loss, rAF,
 * the game reaction); the engine owns the GL objects.
 */

export interface ShaderLayerProps {
  /** Shader id — simple preset, trip preset or "user:<id>" */
  preset: string;
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
  /** What the game is doing right now — see useGamePulse */
  pulse: GamePulse;
  /** Tone-map pass that keeps the UI readable underneath */
  guard: boolean;
  /** Quality-tier multiplier on sim iterations (potato/low halve them) */
  iterationScale: number;
  /** Sim dials: [speed, seed density, kernel zoom] — see u_sim */
  sim: readonly [number, number, number];
  /** Bumping this restarts every simulation (u_frame back to 0) */
  reseedNonce: number;
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
  pulse,
  guard,
  iterationScale,
  sim,
  reseedNonce,
}: ShaderLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const engineRef = useRef<ShaderEngine | null>(null);
  const lostRef = useRef(false);
  // Bumped when the driver hands the context back — every GL object died with
  // it, so the pipeline effect has to build everything again
  const [generation, setGeneration] = useState(0);
  // Values the render loop reads every frame — kept in a ref so a settings
  // change never tears down and recompiles the pipeline
  const live = useRef({ accent, intensity, factor, bpm, renderScale, pulse, sim });
  live.current = { accent, intensity, factor, bpm, renderScale, pulse, sim };

  // Mouse/finger, tracked in a ref: position at 60 Hz through React state
  // would re-render the world — the draw loop just reads the latest value
  const pointerRef = useRef<PointerState>({ ...IDLE_POINTER });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const p = pointerRef.current;
      p.x = e.clientX / window.innerWidth;
      // GL counts from the bottom; flipping here keeps every shader simple
      p.y = 1 - e.clientY / window.innerHeight;
      p.active = true;
    };
    const onDown = (e: PointerEvent) => {
      onMove(e);
      pointerRef.current.clickAt = Date.now();
    };
    const onLeave = () => {
      pointerRef.current.active = false;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("blur", onLeave);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("blur", onLeave);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  // The reseed button: frame counter back to 0, sims re-run their seed branch
  useEffect(() => {
    engineRef.current?.reseed();
  }, [reseedNonce]);

  // A user shader edited in the Studio rebuilds the pipeline live
  const userShaders = useShaderStudioStore((s) => s.shaders);
  const spec: EffectSpec | null = useMemo(() => {
    const resolved = resolveShaderSpec(preset, userShaders);
    if (!resolved) return null;
    const problems = validateSpec(resolved);
    if (problems.length > 0) {
      log.warn("theme", `Shader "${preset}" invalid: ${problems.join("; ")}`);
      return null;
    }
    // Low quality tiers halve sim iterations — resolution x iterations is
    // the real cost of the CA presets, and quality owns both dials
    const scaled: EffectSpec = {
      ...resolved,
      passes: resolved.passes.map((p) =>
        (p.iterations ?? 1) > 1
          ? { ...p, iterations: Math.max(1, Math.round(p.iterations! * iterationScale)) }
          : p,
      ),
    };
    return guard ? withGuard(scaled) : scaled;
  }, [preset, userShaders, guard, iterationScale]);

  // The context outlives every preset switch. Creating it here — once per
  // mounted canvas — is what keeps `loseContext()` in the teardown from
  // killing a canvas that React is about to reuse.
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
    glRef.current = gl;

    // Mobile browsers drop the context when the app is backgrounded; without
    // preventDefault the canvas never comes back
    const onLost = (event: Event) => {
      event.preventDefault();
      lostRef.current = true;
    };
    const onRestored = () => {
      lostRef.current = false;
      setGeneration((g) => g + 1);
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);

    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      glRef.current = null;
      // Safe here and only here: the canvas is leaving the DOM with us
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = glRef.current;
    if (!canvas || !gl || gl.isContextLost() || !spec) return;

    let engine: ShaderEngine;
    try {
      engine = new ShaderEngine(gl, spec);
      engineRef.current = engine;
    } catch (err) {
      if (err instanceof EngineBuildError) {
        log.error(
          "theme",
          `Shader "${spec.id}" pass ${err.passIndex} failed: ${err.message}`,
        );
      } else {
        log.error("theme", `Shader engine failed: ${err}`);
      }
      return;
    }

    // Size comes from a ResizeObserver, NOT from reading clientWidth in the
    // draw loop: layout-property reads force a synchronous reflow whenever
    // React dirtied the DOM this frame — a per-frame tax paid as a safety
    // net for a resize that happens roughly never.
    let cssW = canvas.clientWidth || window.innerWidth;
    let cssH = canvas.clientHeight || window.innerHeight;
    let width = 0;
    let height = 0;
    const applySize = () => {
      // Deliberately NOT devicePixelRatio: a phone at 3x would render nine
      // times the pixels for an effect nobody looks at that closely
      const scale = live.current.renderScale;
      const w = Math.max(1, Math.round(cssW * scale));
      const h = Math.max(1, Math.round(cssH * scale));
      if (w === width && h === height) return;
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
      engine.resize(w, h);
    };
    applySize();
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (!rect) return;
            cssW = rect.width || window.innerWidth;
            cssH = rect.height || window.innerHeight;
            applySize();
          })
        : null;
    observer?.observe(canvas);

    // Accumulated, not derived from wall clock: a speed change must not make
    // the animation jump, and neither must a backgrounded tab
    let shaderTime = 0;
    let lastFrame = 0;
    let elapsed = 0;
    let frame = 0;
    const still = reducedMotion();

    const draw = (now: number) => {
      if (lostRef.current) return;
      const dt = lastFrame === 0 ? 0 : Math.min(100, now - lastFrame);
      lastFrame = now;
      const {
        accent: hex,
        intensity: amount,
        factor: speed,
        bpm: tempo,
        pulse: gamePulse,
      } = live.current;

      const wall = Date.now();
      const pointer = pointerUniform(pointerRef.current, wall);
      // The whole game reaction is one pure function (reaction.ts) — this
      // loop only feeds it the clock and hands the result to the engine.
      // A click rides in as a beat, so EVERY beat-reactive preset punches
      // on tap without knowing the pointer exists (still-mode zeroes it).
      const reacted = reactToGame(gamePulse, {
        intensity: amount,
        beat: Math.max(beatAt(elapsed, tempo, speed), pointer[2]),
        accent: hexToRgb(hex),
        now: wall,
        still,
      });

      shaderTime += (dt / 1000) * speed * reacted.timeScale;
      elapsed += dt;

      // Quality-dial change is the only per-frame size trigger left
      applySize();
      engine.render({
        time: shaderTime,
        beat: reacted.beat,
        intensity: reacted.intensity,
        accent: reacted.accent,
        game: reacted.game,
        pointer,
        sim: live.current.sim,
      });

      if (!still) frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);

    // Dev bridge, same idea as __bitsterStores: lets e2e checks drive a frame
    // by hand — a hidden preview tab never gets a real animation frame
    let bridge: unknown;
    if (__DEV__) {
      bridge = (window as unknown as Record<string, unknown>).__bitsterShaderDebug = {
        specId: spec.id,
        canvas,
        step: (u: {
          time: number;
          beat: number;
          intensity: number;
          accent: [number, number, number];
          game: [number, number, number];
          pointer?: [number, number, number, number];
          sim?: [number, number, number];
        }) => {
          applySize();
          engine.render({ pointer: [0.5, 0.5, 0, 0], sim: [1, 0.5, 1], ...u });
        },
        reseed: () => engine.reseed(),
      };
    }

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      if (__DEV__) {
        const w = window as unknown as Record<string, unknown>;
        // During an HMR remount the NEW instance's bridge is already
        // installed by the time this cleanup runs — only remove our own
        if (w.__bitsterShaderDebug === bridge) delete w.__bitsterShaderDebug;
      }
      engineRef.current = null;
      engine.dispose();
    };
    // A different spec — or a context back from the dead — rebuilds the
    // pipeline. Scale and colours ride the live ref.
  }, [spec, generation]);

  if (!spec) return null;

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
        // BACKDROP mode: the canvas sits BEHIND the app now, so no blend
        // tricks — it paints at full vibrance and the screens' veil
        // (look.ts/veilFor) decides how much reaches the UI. The intensity
        // dial fades the world itself in and out.
        opacity: 0.35 + intensity * 0.65,
      }}
    />
  );
}
