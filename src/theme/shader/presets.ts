/**
 * Full-screen fragment shaders. Each one paints a whole world per pixel — the
 * thing CSS gradients and SVG filters fundamentally cannot do.
 *
 * These are GLSL ES 1.0 (WebGL 1) on purpose: it runs everywhere, including
 * older mobile browsers, and none of these effects need WebGL 2.
 *
 * The shader CANNOT read the UI behind it — no browser API exposes that. So
 * these paint their own world and get composited over the app with a blend
 * mode. Distorting the real UI stays the melt effect's job.
 */

export const SHADER_PRESETS = [
  { id: "kaleido", label: "Kaleidoscope 🔮" },
  { id: "plasma", label: "Liquid plasma 🌊" },
  { id: "tunnel", label: "Tunnel 🕳️" },
  { id: "aurora", label: "Aurora 🌌" },
] as const;

export type ShaderPresetId = (typeof SHADER_PRESETS)[number]["id"];

export function isShaderPresetId(value: unknown): value is ShaderPresetId {
  return SHADER_PRESETS.some((p) => p.id === value);
}

export const VERTEX_SHADER = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

/**
 * Shared prelude: uniforms plus value noise and fbm.
 *
 * u_game is reserved for the second stage (phase, countdown, last result) —
 * declared now so adding it later needs no change to the runtime contract.
 */
const PRELUDE = `
precision highp float;

uniform vec2  u_res;
uniform float u_time;
/** 0..1 sawtooth that resets on every beat — 0 when no tempo is tapped in */
uniform float u_beat;
/** 0..1, straight from the intensity dial */
uniform float u_intensity;
uniform vec3  u_accent;
/** Reserved for game state: x = phase, y = urgency, z = last result */
uniform vec3  u_game;

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

const KALEIDO = `
${PRELUDE}
void main() {
  vec2 uv = centred();
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // THE kaleidoscope: fold the angle into one wedge and mirror it. Three
  // lines, and no amount of CSS or SVG filtering can do it.
  float segments = 5.0 + floor(u_intensity * 9.0);
  float wedge = 6.2831853 / segments;
  a = mod(a + u_time * 0.08, wedge);
  a = abs(a - wedge * 0.5);

  vec2 p = vec2(cos(a), sin(a)) * r * (1.0 + 0.18 * u_beat);

  // Domain warping — noise displacing noise. This is what "organic" means.
  vec2 q = vec2(fbm(p * 2.2 + u_time * 0.12), fbm(p * 2.2 - u_time * 0.09 + 5.1));
  float f = fbm(p * 3.4 + q * 1.6 + u_time * 0.05);

  vec3 col = mix(u_accent, vec3(1.0, 0.95, 0.85), smoothstep(0.35, 0.8, f));
  col = mix(col * 0.25, col, f);
  // Fade the rim so it never boxes the screen in
  col *= smoothstep(1.25, 0.05, r) * (0.65 + 0.35 * u_beat);
  gl_FragColor = vec4(col, 1.0);
}
`;

const PLASMA = `
${PRELUDE}
void main() {
  vec2 p = centred() * (1.2 + u_intensity);

  // Two rounds of domain warping — slow, thick, lava-lamp motion
  vec2 q = vec2(fbm(p + u_time * 0.09), fbm(p + vec2(5.2, 1.3) - u_time * 0.07));
  vec2 s = vec2(
    fbm(p + 3.2 * q + vec2(1.7, 9.2) + u_time * 0.11),
    fbm(p + 3.2 * q + vec2(8.3, 2.8) - u_time * 0.08)
  );
  float f = fbm(p + 3.6 * s);

  vec3 deep = u_accent * 0.35;
  vec3 hot = mix(u_accent, vec3(1.0, 0.85, 0.55), 0.7);
  vec3 col = mix(deep, hot, smoothstep(0.25, 0.85, f));
  col *= 0.55 + 0.45 * f + 0.25 * u_beat;
  gl_FragColor = vec4(col, 1.0);
}
`;

const TUNNEL = `
${PRELUDE}
void main() {
  vec2 uv = centred();
  float r = max(length(uv), 0.04);
  float a = atan(uv.y, uv.x);

  // Fake 3D without any geometry: 1/r IS perspective depth down a pipe
  float segments = 4.0 + floor(u_intensity * 8.0);
  float wedge = 6.2831853 / segments;
  float folded = abs(mod(a, wedge) - wedge * 0.5);

  vec2 t = vec2(folded * segments * 0.5, 0.32 / r + u_time * (0.45 + u_beat * 0.5));
  float f = fbm(t * 2.6);
  float rings = 0.5 + 0.5 * sin(t.y * 12.0 + f * 4.0);

  vec3 col = mix(u_accent * 0.3, vec3(1.0, 0.9, 0.95), f * rings);
  // Dark at the vanishing point, bright at the mouth
  col *= smoothstep(0.0, 0.55, r) * (0.5 + 0.5 * f);
  gl_FragColor = vec4(col, 1.0);
}
`;

const AURORA = `
${PRELUDE}
void main() {
  vec2 uv = centred();
  // Vertical curtains that drift and shear sideways
  float drift = fbm(vec2(uv.x * 1.4, u_time * 0.13)) * 1.4;
  float band = uv.y * 1.6 + drift - 0.35;

  float veil = 0.0;
  for (int i = 0; i < 3; i++) {
    float k = float(i);
    float offset = k * 0.28 - 0.28;
    float w = 0.16 + 0.09 * k;
    float d = abs(band + offset + 0.12 * sin(u_time * 0.3 + k * 2.1));
    veil += smoothstep(w, 0.0, d) * (0.6 - 0.14 * k);
  }
  veil *= 0.6 + 0.4 * fbm(vec2(uv.x * 3.0 - u_time * 0.2, uv.y * 2.0));

  vec3 cold = mix(u_accent, vec3(0.2, 1.0, 0.7), 0.55);
  vec3 col = mix(u_accent * 0.2, cold, veil) * veil;
  col *= 0.7 + 0.5 * u_beat;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const FRAGMENT_SHADERS: Record<ShaderPresetId, string> = {
  kaleido: KALEIDO,
  plasma: PLASMA,
  tunnel: TUNNEL,
  aurora: AURORA,
};
