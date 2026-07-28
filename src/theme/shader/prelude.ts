/**
 * The GLSL substrate every pass is built on: shared uniforms and the little
 * toolbox (hash/noise/fbm). One prelude for built-ins, trip presets AND user
 * shaders — which is why the Studio can promise "these tools just exist".
 *
 * GLSL ES 1.0 (WebGL 1) on purpose: runs everywhere, and nothing here needs
 * more. Per-pass extras (u_prev, named input samplers) are prepended by the
 * engine's assembler, not declared here.
 */

export const VERTEX_SHADER = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const PRELUDE = `
precision highp float;

/** Resolution of the CURRENT render target (not always the canvas) */
uniform vec2  u_res;
uniform float u_time;
/** 0..1 sawtooth that resets on every beat — 0 when no tempo is tapped in */
uniform float u_beat;
/** 0..1, straight from the intensity dial */
uniform float u_intensity;
uniform vec3  u_accent;
/** Game state: x = phase, y = urgency, z = last result */
uniform vec3  u_game;
/** Frames since the pipeline (re)started — lets feedback passes self-seed */
uniform float u_frame;
/**
 * The pointer: xy = position (0..1, y up — subtract from uv directly),
 * z = click impulse decaying 1→0, w = 1 while a pointer is on screen.
 * Clicks also spike u_beat globally, so beat-reactive presets punch for free.
 */
uniform vec4 u_pointer;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  // Smoothstep the cell coordinates — the difference between "organic" and
  // "a grid of squares"
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * noise(p);
    p *= 2.02;
    amp *= 0.5;
  }
  return sum;
}

/** Screen-space coordinates centred on 0, aspect-correct */
vec2 centred() {
  return (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
}
`;

/** Lines the assembler puts in front of user source — for error mapping */
export function preludeLineCount(extra: string): number {
  return (PRELUDE + extra).split("\n").length;
}
