/**
 * The multi-pass effect model. A simple preset is the trivial case (one pass,
 * straight to screen); the trip presets and user shaders use the rest:
 * buffers that persist between frames (feedback), several sim steps per frame
 * (iterations) and reduced-resolution targets (scale).
 *
 * This is deliberately a Shadertoy-shaped model — it is the smallest thing
 * that makes video feedback, reaction-diffusion and post-processing possible.
 */

export interface PassSpec {
  /** Buffer this pass writes, or "screen" for the canvas itself */
  target: string;
  /** GLSL fragment body — the shared prelude and samplers get prepended */
  source: string;
  /** Named buffers this pass samples, bound as `u_<name>` */
  inputs?: string[];
  /** The pass reads its own last frame as `u_prev` (ping-pong) */
  feedback?: boolean;
  /** Sim steps per frame — reaction-diffusion needs several to move */
  iterations?: number;
  /** Target resolution relative to the canvas (0 < scale <= 1) */
  scale?: number;
  /**
   * Fixed sim-grid height in texels; width follows the canvas aspect.
   * Kernel radii are measured in texels, so a screen-proportional buffer
   * means the PHYSICS changes with the window — a Lenia that lives on a
   * laptop turns to noise on a 4K screen. Fixing the grid decouples the
   * simulation from the display entirely (and caps its cost for free).
   */
  fixedHeight?: number;
  /** "high" = half-float textures (simulations need the precision) */
  precision?: "default" | "high";
}

export interface EffectSpec {
  id: string;
  passes: PassSpec[];
}

/** What the render loop feeds the engine every frame */
export interface EngineUniforms {
  time: number;
  beat: number;
  intensity: number;
  accent: readonly [number, number, number];
  game: readonly [number, number, number];
  /** xy position (0..1, y up), z click impulse, w pointer-on-screen */
  pointer: readonly [number, number, number, number];
  /** Sim dials: x = speed multiplier, y = seed density 0..1, z = kernel zoom */
  sim: readonly [number, number, number];
}

export const MIN_FIXED_HEIGHT = 32;
export const MAX_FIXED_HEIGHT = 1024;

export const MAX_PASSES = 6;
export const MAX_ITERATIONS = 24;
/** Per-pass GLSL cap — user shaders come through here too */
export const MAX_SOURCE_LENGTH = 20_000;
/**
 * Name of the guard's intermediate buffer. No leading underscores — double
 * underscore is reserved in GLSL ES and `u___x` would anger strict drivers.
 * validateSpec rejects user specs claiming it.
 */
export const GUARD_BUFFER = "bitster_guard";

export const BUFFER_NAME_RE = /^[a-z][a-z0-9_]{0,15}$/;
