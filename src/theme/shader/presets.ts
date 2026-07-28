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
  { id: "discofloor", label: "Disco floor 🪩" },
  { id: "hyperspace", label: "Hyperspace 🚀" },
  { id: "blobs", label: "Lava blobs 🫧" },
  { id: "cells", label: "Cells 🦠" },
  { id: "ripple", label: "Shockwave 💥" },
  { id: "vaporwave", label: "Vaporwave 🌴" },
  { id: "fireworks", label: "Fireworks 🎆" },
  { id: "storm", label: "Thunderstorm ⛈️" },
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

  // u_game.y is the countdown. Going faster is the runtime's job; what it
  // cannot do is narrow the pipe — so the walls close in as time runs out.
  float squeeze = 1.0 + u_game.y * 1.6;
  vec2 t = vec2(
    folded * segments * 0.5,
    0.32 / (r * squeeze) + u_time * (0.45 + u_beat * 0.5)
  );
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

/**
 * A dance floor stretching to the horizon. The perspective is the same 1/depth
 * trick as the tunnel, but laid flat — and each tile lights up on its own
 * schedule, all of them slamming together on the beat.
 */
const DISCOFLOOR = `
${PRELUDE}
void main() {
  vec2 uv = centred();
  float horizon = 0.14;
  float below = horizon - uv.y;
  vec3 col;

  if (below > 0.004) {
    // 1/distance IS perspective. Everything else is decoration.
    float depth = 1.0 / below;
    vec2 grid = vec2(uv.x * depth * 0.55, depth * 0.30 + u_time * 0.7);
    vec2 cell = floor(grid);
    vec2 f = fract(grid);

    float checker = mod(cell.x + cell.y, 2.0);
    // Each tile gets its own phase so the floor shimmers between beats...
    float phase = hash(cell);
    float pulse = fract(phase + u_time * 0.25);
    float lit = smoothstep(0.75, 1.0, pulse);
    // ...and then the whole floor answers the downbeat at once
    lit = max(lit, u_beat * (0.35 + 0.65 * step(0.5, phase)));

    // Dark grout between the tiles keeps it reading as tiles, not a gradient
    vec2 seam = smoothstep(0.0, 0.06, f) * smoothstep(0.0, 0.06, 1.0 - f);
    float tile = seam.x * seam.y;

    vec3 base = mix(u_accent * 0.12, u_accent * 0.5, checker);
    col = mix(base, mix(u_accent, vec3(1.0), 0.55), lit) * tile;
    // Fog, or the far tiles turn into aliasing soup
    col *= exp(-depth * 0.055);
  } else {
    // Glow bleeding up off the floor
    float glow = exp(-(uv.y - horizon) * 6.0);
    col = u_accent * glow * (0.10 + 0.20 * u_beat);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

/** Stars streaking past. Speed is the beat, so the drop feels like a jump. */
const HYPERSPACE = `
${PRELUDE}
void main() {
  vec2 uv = centred();
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  float lanes = 60.0 + floor(u_intensity * 90.0);

  // Nebula the ship flies through: fbm smeared along the lane axis so it
  // streaks outward with the stars instead of sitting still behind them
  float haze = fbm(vec2(a * 2.6, r * 3.0 - u_time * 0.8));
  haze *= fbm(vec2(a * 1.3 + 5.0, r * 1.6 - u_time * 0.35));
  vec3 col = mix(u_accent, vec3(0.35, 0.15, 0.9), 0.35) * haze * 1.5;
  // Core glow — the point everything rushes away from
  col += mix(u_accent, vec3(1.0), 0.5) * (0.25 + 0.5 * u_beat) * exp(-r * 4.5);

  for (int i = 0; i < 5; i++) {
    float layer = float(i);
    float lane = floor((a / 6.2831853 + 0.5) * lanes + layer * 13.7);
    float seed = hash(vec2(lane, layer + 1.0));
    float speed = 0.25 + seed * 0.7 + u_beat * 0.55;
    // Squaring the travel makes stars accelerate as they pass — the whole
    // reason hyperspace reads as speed rather than as moving dots
    float z = fract(seed * 7.3 + u_time * speed);
    float starR = z * z * 1.6;
    float d = abs(r - starR);
    float streak = smoothstep(0.09 * z + 0.006, 0.0, d);
    // Thin out each lane so it is stars, not a solid fan
    streak *= step(0.42, hash(vec2(lane, floor(seed * 20.0) + layer)));
    col += mix(u_accent, vec3(1.0), z) * streak * (0.5 + 0.8 * z);
  }

  col *= smoothstep(0.02, 0.25, r) * 0.85 + 0.15;
  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * Actual 3D: signed-distance spheres melted together and ray-marched, with a
 * light and a rim. No geometry, no scene graph, no three.js — just a function
 * that answers "how far is the nearest surface from here".
 */
const BLOBS = `
${PRELUDE}

float sdSphere(vec3 p, float r) { return length(p) - r; }

/** Smooth minimum — THE reason the blobs merge instead of intersecting */
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float scene(vec3 p) {
  float t = u_time * 0.5;
  float swell = 0.42 + 0.12 * u_beat;
  float d = sdSphere(p - vec3(sin(t) * 0.75, cos(t * 1.3) * 0.45, 0.0), swell + 0.08);
  d = smin(d, sdSphere(p - vec3(cos(t * 0.9) * 0.85, sin(t * 0.7) * 0.55, sin(t) * 0.4), swell), 0.55);
  d = smin(d, sdSphere(p - vec3(sin(t * 1.4) * 0.6, cos(t * 1.1) * 0.75, cos(t) * 0.5), swell - 0.06), 0.55);
  d = smin(d, sdSphere(p - vec3(0.0, sin(t * 1.7) * 0.3, cos(t * 1.5) * 0.6), swell - 0.1), 0.5);
  return d;
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.002, 0.0);
  return normalize(vec3(
    scene(p + e.xyy) - scene(p - e.xyy),
    scene(p + e.yxy) - scene(p - e.yxy),
    scene(p + e.yyx) - scene(p - e.yyx)
  ));
}

void main() {
  vec2 uv = centred();
  vec3 ro = vec3(0.0, 0.0, -2.3);
  vec3 rd = normalize(vec3(uv * 1.15, 1.0));

  float travelled = 0.0;
  float hit = 0.0;
  // Closest the ray ever came to a surface — free volumetric glow, so the
  // blobs bleed light into the space around them instead of ending at a hard edge
  float nearest = 10.0;
  for (int i = 0; i < 48; i++) {
    vec3 p = ro + rd * travelled;
    float d = scene(p);
    nearest = min(nearest, d);
    if (d < 0.002) { hit = 1.0; break; }
    if (travelled > 7.0) break;
    travelled += d;
  }

  // Lava-lamp backdrop: slow warped noise so a miss is still a colour
  float wash = fbm(uv * 1.8 + vec2(0.0, u_time * 0.12));
  vec3 col = mix(u_accent * 0.35, vec3(0.05, 0.02, 0.15), wash) * 0.55;
  col += u_accent * exp(-nearest * 3.2) * (0.5 + 0.5 * u_beat);

  if (hit > 0.5) {
    vec3 p = ro + rd * travelled;
    vec3 n = normalAt(p);
    vec3 lightDir = normalize(vec3(0.6, 0.8, -0.6));
    float diffuse = max(dot(n, lightDir), 0.0);
    float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 24.0);
    // Fresnel rim: the edge glows because we see it at a glancing angle
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.5);

    // Adds on top of the backdrop — the surface is lit, not cut out of it
    col += u_accent * (0.18 + 0.75 * diffuse);
    col += vec3(1.0) * spec * 0.6;
    col += mix(u_accent, vec3(1.0), 0.6) * rim * (0.5 + 0.5 * u_beat);
    col *= exp(-travelled * 0.12);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * Voronoi membranes: for every pixel, find the two nearest of a field of
 * drifting points. The gap between those two distances draws the wall between
 * cells — organic in a way noise never manages, because it has structure.
 */
const CELLS = `
${PRELUDE}
void main() {
  vec2 p = centred() * (2.0 + u_intensity * 3.0);
  vec2 base = floor(p);
  vec2 f = fract(p);

  float nearest = 8.0;
  float second = 8.0;
  float id = 0.0;

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 cell = base + g;
      // Each cell's point wanders on its own little orbit
      vec2 wobble = vec2(hash(cell), hash(cell + 41.7));
      vec2 point = g + 0.5 + 0.42 * sin(u_time * 0.6 + 6.2831853 * wobble);
      float d = length(point - f);
      if (d < nearest) {
        second = nearest;
        nearest = d;
        id = hash(cell + 7.3);
      } else if (d < second) {
        second = d;
      }
    }
  }

  float wall = smoothstep(0.0, 0.28, second - nearest);
  vec3 inside = mix(u_accent * 0.25, mix(u_accent, vec3(1.0, 0.9, 0.7), id), 0.65);
  vec3 col = mix(mix(u_accent, vec3(1.0), 0.75), inside, wall);
  col *= 0.35 + 0.65 * (1.0 - nearest) + 0.25 * u_beat;
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Shockwaves fired on the beat, interfering with each other as they spread */
const RIPPLE = `
${PRELUDE}
void main() {
  vec2 uv = centred();
  float r = length(uv);
  float wave = 0.0;

  // A staggered fleet of rings so something is always travelling
  for (int i = 0; i < 4; i++) {
    float age = fract(u_time * 0.3 + float(i) * 0.25);
    float radius = age * 1.7;
    float ring = smoothstep(0.05, 0.0, abs(r - radius));
    wave += ring * (1.0 - age) * 0.7;
  }

  // The beat fires its own ring, sharper and brighter than the ambient ones
  float beatAge = 1.0 - u_beat;
  float beatRing = smoothstep(0.035, 0.0, abs(r - beatAge * 1.4));
  wave += beatRing * u_beat * 1.6;

  // Ripples distort the field they travel through
  float warp = fbm(uv * 3.0 + wave * 1.2 + u_time * 0.1);
  vec3 col = mix(u_accent * 0.15, mix(u_accent, vec3(1.0), 0.6), wave);
  col *= 0.45 + 0.55 * warp;
  col *= smoothstep(1.5, 0.1, r);
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Chrome sun over an endless grid — the whole 80s in twenty lines */
const VAPORWAVE = `
${PRELUDE}
void main() {
  vec2 uv = centred();
  float horizon = 0.0;
  vec3 col;

  if (uv.y > horizon) {
    // Sun, sliced by widening gaps toward the bottom
    vec2 s = (uv - vec2(0.0, 0.26)) * vec2(1.0, 1.0);
    float disc = smoothstep(0.32, 0.305, length(s));
    float slit = step(0.42, fract(uv.y * 26.0));
    float cut = mix(1.0, slit, smoothstep(0.34, 0.06, uv.y));
    vec3 sunCol = mix(vec3(1.0, 0.85, 0.35), u_accent, smoothstep(-0.05, 0.5, uv.y));
    float glow = exp(-abs(length(s)) * 3.2) * 0.35;
    col = sunCol * disc * cut + sunCol * glow * (0.6 + 0.4 * u_beat);
  } else {
    // Grid running to the vanishing point
    float depth = 1.0 / max(horizon - uv.y, 0.002);
    float x = uv.x * depth * 0.5;
    float z = depth * 0.28 + u_time * 0.55;
    vec2 lineDist = abs(fract(vec2(x, z)) - 0.5);
    float grid = smoothstep(0.06, 0.0, min(lineDist.x, lineDist.y));
    col = mix(u_accent, vec3(1.0, 0.4, 0.9), 0.4) * grid;
    col *= exp(-depth * 0.05) * (0.7 + 0.5 * u_beat);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * Particle bursts without particles: every spark is derived from its angle, so
 * the GPU never stores one. Each burst gets an integer id — that id picks the
 * launch spot, the colour and every spark's jitter, and stays stable while the
 * burst's age runs 0→1.
 */
const FIREWORKS = `
${PRELUDE}

vec3 burst(vec2 uv, float id, float age, float sparks) {
  vec2 centre = vec2(hash(vec2(id, 1.0)) - 0.5, hash(vec2(id, 7.3)) * 0.55 - 0.2);
  vec2 d = uv - centre;
  // Gravity drags the whole shell down as it ages
  d.y += age * age * 0.32;
  float r = length(d);
  float idx = floor((atan(d.y, d.x) / 6.2831853 + 0.5) * sparks);
  float jitter = hash(vec2(idx, id + 3.0));
  float reach = (0.12 + 0.3 * hash(vec2(id, 2.0))) * (0.55 + 0.9 * jitter);
  // Ease-out: sparks shoot, then coast — a linear expansion looks like a ring
  float shell = reach * (1.0 - pow(1.0 - age, 2.4));
  float head = smoothstep(0.016, 0.0, abs(r - shell));
  float glow = exp(-abs(r - shell) * 22.0) * 0.45;
  float life = pow(1.0 - age, 1.7);
  vec3 tint = mix(u_accent, vec3(1.0, 0.8, 0.35), hash(vec2(id, 9.1)));
  return mix(tint, vec3(1.0), head * 0.7) * (head + glow) * life;
}

void main() {
  vec2 uv = centred();
  // Deliberately NOT beat-driven timing: u_beat spikes, and a jumping clock
  // would restart bursts mid-flight
  float t = u_time * (0.4 + u_intensity * 0.45);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    float lane = float(i);
    float local = t * (0.7 + 0.17 * lane) + lane * 0.37;
    col += burst(uv, floor(local) + lane * 31.0, fract(local), 24.0 + lane * 7.0);
  }
  // Smoke haze plus a sky that flashes on the downbeat
  col += mix(u_accent, vec3(0.2, 0.1, 0.4), 0.5) * fbm(uv * 2.2 + t * 0.1) * 0.18;
  col *= 0.7 + 0.7 * u_beat;
  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * Bolts that strike downward on the beat. The wander comes from fbm along the
 * vertical axis at two frequencies — coarse for the path, fine for the crackle.
 */
const STORM = `
${PRELUDE}

float bolt(vec2 uv, float seed, float front) {
  float x = uv.x - (hash(vec2(seed, 1.0)) - 0.5) * 1.2;
  float wander = (fbm(vec2(uv.y * 2.2 + seed * 10.0, u_time * 0.5)) - 0.5) * 0.6;
  wander += (noise(vec2(uv.y * 11.0 + seed * 3.0, u_time * 1.6)) - 0.5) * 0.1;
  float d = abs(x - wander);
  float core = smoothstep(0.014, 0.0, d);
  float glow = exp(-d * 13.0) * 0.5;
  // Only the part above the descending front exists yet
  return (core + glow) * smoothstep(front - 0.06, front + 0.06, uv.y);
}

void main() {
  vec2 uv = centred();
  // Clouds first, so the bolts light them from inside
  float clouds = fbm(uv * 2.0 + vec2(u_time * 0.06, 0.0));
  vec3 col = mix(vec3(0.02, 0.02, 0.06), u_accent * 0.28, clouds * smoothstep(-0.1, 0.5, uv.y));

  // u_game.y is the countdown. The runtime already speeds everything up under
  // pressure — what it CANNOT do is strike more often, so that happens here.
  float panic = u_game.y;
  float flash = 0.0;
  for (int i = 0; i < 3; i++) {
    float seed = float(i) * 17.0 + 1.0;
    // One phase drives both: fract() is the strike's life, floor() picks the
    // path — so the bolt can't rewrite itself halfway down
    float phase =
      u_time * (0.35 + 0.12 * float(i)) * (1.0 + panic * 1.8) +
      hash(vec2(seed, 5.0));
    float strike = fract(phase);
    // The front whips to the ground in the first fifth of the strike; the rest
    // of the cycle is the bolt hanging there and fading
    float front = 0.62 - strike * 4.0;
    float energy = pow(1.0 - strike, 1.6) * (0.5 + 0.9 * u_intensity);
    // Real bolts re-strike a few times before they die
    energy *= 0.6 + 0.4 * sin(strike * 70.0 + seed);
    flash += bolt(uv, seed + floor(phase) * 3.0, front) * max(energy, 0.0);
  }
  flash = flash * 1.6 + u_beat * 0.12;

  col += mix(u_accent, vec3(1.0), 0.75) * flash;
  // The whole sky brightens with the strike, not just the bolt
  col += u_accent * flash * 0.25 * clouds;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const FRAGMENT_SHADERS: Record<ShaderPresetId, string> = {
  kaleido: KALEIDO,
  plasma: PLASMA,
  tunnel: TUNNEL,
  aurora: AURORA,
  discofloor: DISCOFLOOR,
  hyperspace: HYPERSPACE,
  blobs: BLOBS,
  cells: CELLS,
  ripple: RIPPLE,
  vaporwave: VAPORWAVE,
  fireworks: FIREWORKS,
  storm: STORM,
};
