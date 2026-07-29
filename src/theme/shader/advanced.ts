import type { EffectSpec } from "./engine/types";

/**
 * Trip presets — the reason the multi-pass engine exists. Each one leans on a
 * capability the single-pass presets fundamentally don't have: buffers that
 * remember the last frame (video feedback, ink advection), several sim steps
 * per frame (reaction-diffusion), or just an unapologetic amount of GPU work
 * (raymarched fractal). Gated behind trip mode; the Studio builds on the
 * same spec model.
 */

export interface TripPreset {
  id: string;
  label: string;
  blurb: string;
  spec: EffectSpec;
}

/**
 * Video feedback: every frame samples the previous one, zoomed and rotated.
 * The seed orbs smear into spiralling light tunnels — the classic camera-
 * pointed-at-its-own-monitor trip, impossible without a persistent buffer.
 */
const WORMHOLE: EffectSpec = {
  id: "wormhole",
  passes: [
    {
      target: "trail",
      feedback: true,
      source: `
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  // Rotate + zoom into the previous frame — THE feedback loop. The vanishing
  // point follows the pointer: the wormhole opens where you point.
  vec2 centre = mix(vec2(0.5), u_pointer.xy, u_pointer.w * 0.8);
  float ang = 0.014 + u_beat * 0.035 + u_game.y * 0.02;
  float zoom = 0.986 - u_intensity * 0.014;
  float ca = cos(ang);
  float sa = sin(ang);
  vec2 p = (uv - centre) * zoom;
  p = mat2(ca, -sa, sa, ca) * p + centre;
  vec3 prev = texture2D(u_prev, p).rgb;

  // Fresh light: a ring of orbs for the trail to swallow
  vec2 c = uv - 0.5;
  c.x *= u_res.x / u_res.y;
  vec3 seed = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float k = float(i) * 1.0471976;
    vec2 orb = 0.31 * vec2(cos(u_time * 0.5 + k), sin(u_time * 0.5 + k));
    float d = length(c - orb);
    vec3 tint = mix(u_accent, vec3(1.0), 0.35 + 0.35 * sin(k * 2.0 + u_time));
    seed += tint * exp(-d * d * 260.0) * (0.7 + 1.6 * u_beat);
  }

  // A click drops a flare right under the cursor for the trail to swallow
  vec2 pc = (uv - u_pointer.xy) * vec2(u_res.x / u_res.y, 1.0);
  seed += mix(u_accent, vec3(1.0), 0.6) *
    u_pointer.z * 2.2 * exp(-dot(pc, pc) * 180.0);

  // Slow decay keeps the tunnel luminous without blowing out to white
  gl_FragColor = vec4(max(prev * 0.972, seed), 1.0);
}
`,
    },
    {
      target: "screen",
      inputs: ["trail"],
      source: `
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  // Radial chromatic aberration — the cheap lens that sells the depth
  vec2 shift = (uv - 0.5) * 0.007 * (0.5 + u_intensity);
  float r = texture2D(u_trail, uv + shift).r;
  float g = texture2D(u_trail, uv).g;
  float b = texture2D(u_trail, uv - shift).b;
  gl_FragColor = vec4(r, g, b, 1.0);
}
`,
    },
  ],
};

/**
 * Gray-Scott reaction-diffusion: two chemicals feeding on each other, run
 * several steps per frame in a half-float buffer. Patterns GROW — coral,
 * fingerprints, mitosis — nothing is animated, it all emerges.
 */
const ACID: EffectSpec = {
  id: "acid",
  passes: [
    {
      target: "sim",
      feedback: true,
      iterations: 10,
      scale: 0.5,
      precision: "high",
      source: `
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  if (u_frame < 1.0) {
    // Primordial soup: substrate everywhere, activator islands
    float b = step(0.84, noise(uv * 26.0)) + step(0.995, hash(uv * u_res));
    gl_FragColor = vec4(1.0, min(b, 1.0), 0.0, 1.0);
    return;
  }

  vec2 px = 1.0 / u_res;
  vec2 c = texture2D(u_prev, uv).rg;
  // 3x3 Laplacian: orthogonal 0.2, diagonal 0.05, centre -1
  vec2 lap = -c;
  lap += texture2D(u_prev, uv + vec2( px.x, 0.0)).rg * 0.2;
  lap += texture2D(u_prev, uv + vec2(-px.x, 0.0)).rg * 0.2;
  lap += texture2D(u_prev, uv + vec2(0.0,  px.y)).rg * 0.2;
  lap += texture2D(u_prev, uv + vec2(0.0, -px.y)).rg * 0.2;
  lap += texture2D(u_prev, uv + vec2( px.x,  px.y)).rg * 0.05;
  lap += texture2D(u_prev, uv + vec2(-px.x,  px.y)).rg * 0.05;
  lap += texture2D(u_prev, uv + vec2( px.x, -px.y)).rg * 0.05;
  lap += texture2D(u_prev, uv + vec2(-px.x, -px.y)).rg * 0.05;

  // Feed/kill drift across the screen so several pattern species coexist;
  // the beat nudges the feed — the colony literally pulses with the song
  float feed = 0.034 + 0.012 * uv.y + u_beat * 0.003;
  float kill = 0.056 + 0.01 * uv.x;

  float A = c.r;
  float B = c.g;
  float reaction = A * B * B;
  float dA = 1.0 * lap.x - reaction + feed * (1.0 - A);
  float dB = 0.5 * lap.y + reaction - (kill + feed) * B;

  // A click PAINTS activator under the cursor — you are literally seeding
  // new colonies into the dish
  vec2 pd = (uv - u_pointer.xy) * vec2(u_res.x / u_res.y, 1.0);
  float inject = u_pointer.z * exp(-dot(pd, pd) * 600.0);

  gl_FragColor = vec4(
    clamp(A + dA, 0.0, 1.0),
    clamp(B + dB + inject * 0.5, 0.0, 1.0),
    0.0, 1.0
  );
}
`,
    },
    {
      target: "screen",
      inputs: ["sim"],
      source: `
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float b = texture2D(u_sim, uv).g;
  // Colour by activator concentration: dark substrate, hot membranes
  float body = smoothstep(0.12, 0.42, b);
  float edge = smoothstep(0.14, 0.3, b) - smoothstep(0.3, 0.55, b);
  vec3 col = mix(u_accent * 0.08, u_accent, body);
  col += mix(u_accent, vec3(1.0), 0.75) * edge * (0.7 + 0.5 * u_beat);
  gl_FragColor = vec4(col, 1.0);
}
`,
    },
  ],
};

/**
 * A raymarched Mandelbulb — an actual 3D fractal, no geometry, no library.
 * The power breathes with time and the beat, so the whole thing blooms and
 * collapses. This one is simply expensive on purpose: let it glow.
 */
const MANDELBULB: EffectSpec = {
  id: "mandelbulb",
  passes: [
    {
      target: "screen",
      source: `
float bulbDE(vec3 p, float power, out float trap) {
  vec3 z = p;
  float dr = 1.0;
  float r = 0.0;
  trap = 1e9;
  for (int i = 0; i < 9; i++) {
    r = length(z);
    if (r > 2.0) break;
    trap = min(trap, r);
    float theta = acos(z.z / r) * power;
    float phi = atan(z.y, z.x) * power;
    dr = pow(r, power - 1.0) * power * dr + 1.0;
    float zr = pow(r, power);
    z = zr * vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta)) + p;
  }
  return 0.5 * log(r) * r / dr;
}

void main() {
  vec2 uv = centred();
  // The bulb breathes: power swells with time, slams on the beat — and a
  // click sends a ripple of extra power through the whole fractal
  float power = 6.0 + 2.0 * sin(u_time * 0.11) + u_beat * 1.2 + u_pointer.z * 1.5;

  // Slow orbit camera; the pointer steers it — drag around the bulb
  float t = u_time * 0.13 + (u_pointer.x - 0.5) * u_pointer.w * 2.4;
  float lift = 1.1 * sin(u_time * 0.07) + (u_pointer.y - 0.5) * u_pointer.w * 1.8;
  vec3 ro = vec3(2.6 * cos(t), lift, 2.6 * sin(t));
  vec3 fwd = normalize(-ro);
  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, fwd);
  vec3 rd = normalize(fwd + uv.x * right * 1.3 + uv.y * up * 1.3);

  float travelled = 0.0;
  float trap = 1e9;
  float glow = 0.0;
  float hit = 0.0;
  for (int i = 0; i < 72; i++) {
    vec3 p = ro + rd * travelled;
    float lastTrap;
    float d = bulbDE(p, power, lastTrap);
    trap = min(trap, lastTrap);
    glow += 0.012 / (0.15 + abs(d));
    if (d < 0.0012) { hit = 1.0; break; }
    if (travelled > 6.0) break;
    travelled += d * 0.85;
  }

  // Space the bulb floats in
  vec3 col = mix(u_accent * 0.06, vec3(0.02, 0.01, 0.06), length(uv));
  col += u_accent * glow * 0.12 * (0.5 + u_intensity);

  if (hit > 0.5) {
    // Orbit-trap colouring: the fractal's own geometry picks the palette
    float band = clamp(trap * 0.9, 0.0, 1.0);
    vec3 body = mix(vec3(1.0, 0.9, 0.75), u_accent, band);
    float depth = exp(-travelled * 0.45);
    col = body * depth * (0.35 + 0.65 * (1.0 - band));
    col += u_accent * (1.0 - depth) * 0.3;
  }
  col *= 0.75 + 0.45 * u_beat;
  gl_FragColor = vec4(col, 1.0);
}
`,
    },
  ],
};

/**
 * Ink advected along the curl of a noise field. Divergence-free flow means
 * the ink swirls and folds like fluid without ever draining away — a fake
 * fluid sim that costs one pass and reads like the real thing.
 */
const INKFLOW: EffectSpec = {
  id: "inkflow",
  passes: [
    {
      target: "ink",
      feedback: true,
      source: `
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 asp = vec2(u_res.x / u_res.y, 1.0);

  // Curl of fbm: rotate the gradient 90° and the field becomes
  // divergence-free — this is why the ink never piles up or vanishes
  float e = 0.01;
  vec2 p = uv * 3.0 + u_time * 0.04;
  float dx = fbm(p + vec2(e, 0.0)) - fbm(p - vec2(e, 0.0));
  float dy = fbm(p + vec2(0.0, e)) - fbm(p - vec2(0.0, e));
  vec2 curl = vec2(dy, -dx) / (2.0 * e);

  vec2 src = uv - curl * 0.0022 * (0.5 + u_intensity);
  vec3 prev = texture2D(u_prev, src).rgb * 0.991;

  // Three orbiting ink emitters in different tints
  vec3 ink = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float k = float(i) * 2.0943951;
    vec2 orb = vec2(0.5) + vec2(
      0.30 * cos(u_time * 0.29 + k),
      0.27 * sin(u_time * 0.41 + k)
    );
    float d = length((uv - orb) * asp);
    vec3 tint = i == 0
      ? u_accent
      : i == 1
        ? mix(u_accent, vec3(1.0), 0.65)
        : u_accent.brg;
    ink += tint * exp(-d * d * 700.0) * (0.45 + 1.1 * u_beat);
  }

  // The pointer is a fourth pen: it seeps ink while it moves and a click
  // dumps a whole splash into the current
  vec2 pd = (uv - u_pointer.xy) * asp;
  ink += mix(u_accent, vec3(1.0), 0.5) * u_pointer.w *
    exp(-dot(pd, pd) * 900.0) * (0.3 + 2.0 * u_pointer.z);

  gl_FragColor = vec4(max(prev, ink), 1.0);
}
`,
    },
    {
      target: "screen",
      inputs: ["ink"],
      source: `
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec3 c = texture2D(u_ink, uv).rgb;
  // Lift the mids so thin ink wisps stay visible
  gl_FragColor = vec4(pow(c, vec3(0.85)), 1.0);
}
`,
    },
  ],
};

/**
 * Cyclic cellular automaton (rock-paper-scissors with 12 states): every state
 * is eaten by its successor, and out of pure noise, spiral galaxies condense.
 * The wave fronts surge on the beat; a click sows fresh chaos that new
 * spirals nucleate around.
 */
const CYCLIC: EffectSpec = {
  id: "cyclic",
  passes: [
    {
      target: "ca",
      feedback: true,
      iterations: 3,
      scale: 0.5,
      precision: "high",
      source: `
const float STATES = 14.0;

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 px = 1.0 / u_res;
  if (u_frame < 1.0) {
    // Pure noise — the spirals assemble themselves out of this
    float s = floor(hash(floor(gl_FragCoord.xy)) * STATES);
    gl_FragColor = vec4(s / STATES, 0.0, 0.0, 1.0);
    return;
  }

  float here = floor(texture2D(u_prev, uv).r * STATES + 0.5);
  // The state that EATS this one
  float hunter = mod(here + 1.0, STATES);

  float count = 0.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      if (dx == 0 && dy == 0) continue;
      float n = floor(
        texture2D(u_prev, uv + vec2(float(dx), float(dy)) * px).r * STATES + 0.5
      );
      if (abs(n - hunter) < 0.5) count += 1.0;
    }
  }

  // Threshold 1 — with 14 states a cell sees its hunter among 8 neighbours
  // only about half the time, and exactly that scarcity is what winds the
  // wave fronts into spirals. Threshold 3 freezes the whole dish solid.
  float next = count >= 1.0 ? hunter : here;

  // A click sows raw noise — chaos that fresh spirals condense around
  vec2 pd = (uv - u_pointer.xy) * vec2(u_res.x / u_res.y, 1.0);
  if (u_pointer.z > 0.4 && dot(pd, pd) < 0.02) {
    next = floor(hash(floor(gl_FragCoord.xy) + u_time) * STATES);
  }

  gl_FragColor = vec4(next / STATES, 0.0, 0.0, 1.0);
}
`,
    },
    {
      target: "screen",
      inputs: ["ca"],
      source: `
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 px = 1.0 / u_res;
  float s = texture2D(u_ca, uv).r * (14.0 / 13.0);

  // Cosine palette around the state cycle, pulled toward the accent
  vec3 pal = 0.5 + 0.5 * cos(6.2831853 * (s + vec3(0.0, 0.33, 0.67)));
  float tone = dot(pal, vec3(0.299, 0.587, 0.114));
  vec3 col = mix(pal * 0.45, u_accent * (0.4 + tone), 0.5);

  // State borders are the spiral fronts — light them up
  float n1 = texture2D(u_ca, uv + vec2(px.x, 0.0)).r;
  float n2 = texture2D(u_ca, uv + vec2(0.0, px.y)).r;
  float edge = step(0.01, abs(s * (13.0/14.0) - n1) + abs(s * (13.0/14.0) - n2));
  col += mix(u_accent, vec3(1.0), 0.45) * edge * 0.3;

  col *= 0.75 + 0.4 * u_beat;
  gl_FragColor = vec4(col, 1.0);
}
`,
    },
  ],
};

/**
 * The kaliset: z = |z| / (z·z) − c, iterated. One line of maths that the
 * demoscene has lived off for a decade — folds space into glowing cathedral
 * vaults. The pointer steers the parameter c directly: you are bending the
 * fractal by hand.
 */
const KALISET: EffectSpec = {
  id: "kaliset",
  passes: [
    {
      target: "screen",
      source: `
void main() {
  vec2 uv = centred();
  vec2 z = uv * (1.4 + 0.3 * sin(u_time * 0.06));

  // c drifts on its own; the pointer takes the wheel while on screen
  vec2 drift = vec2(
    0.84 + 0.06 * sin(u_time * 0.043),
    0.58 + 0.05 * cos(u_time * 0.057)
  );
  vec2 steer = vec2(0.45 + 0.65 * u_pointer.x, 0.35 + 0.5 * u_pointer.y);
  vec2 c = mix(drift, steer, u_pointer.w * 0.65);

  float acc = 0.0;
  float trap = 1e9;
  for (int i = 0; i < 17; i++) {
    z = abs(z) / max(dot(z, z), 1e-6) - c;
    acc += exp(-length(z) * 1.6);
    trap = min(trap, abs(z.x) + abs(z.y));
  }
  acc /= 17.0;

  vec3 col = u_accent * acc * 2.2;
  // The orbit trap draws the luminous ribs through the vaults
  float glow = exp(-trap * 7.0);
  col += mix(u_accent, vec3(1.0), 0.7) * glow * (0.45 + 0.65 * u_beat);
  // Slow channel drift keeps the palette breathing
  col = mix(col, col.bgr, 0.25 + 0.25 * sin(u_time * 0.11));
  col *= smoothstep(1.7, 0.3, length(uv));
  gl_FragColor = vec4(col, 1.0);
}
`,
    },
  ],
};

/**
 * SmoothLife (Rafler): Conway's Game of Life generalised to continuous space
 * and time. Inner disc and outer ring get sampled per pixel, a sigmoid decides
 * birth and death — and the soup grows amoebas that crawl, split and merge.
 * A click feeds the soup; a dead dish can always be revived by hand.
 */
const SMOOTHLIFE: EffectSpec = {
  id: "smoothlife",
  passes: [
    {
      target: "life",
      feedback: true,
      iterations: 2,
      scale: 0.4,
      precision: "high",
      source: `
const float PI2 = 6.2831853;

float sigmaf(float x, float a, float alpha) {
  return 1.0 / (1.0 + exp(-(x - a) * 4.0 / alpha));
}

/** The classic smooth-glider rule set (b 0.278..0.365, d 0.267..0.445) */
float rule(float n, float m) {
  float wake = sigmaf(m, 0.5, 0.147);
  float lo = mix(0.278, 0.267, wake);
  float hi = mix(0.365, 0.445, wake);
  return sigmaf(n, lo, 0.028) * (1.0 - sigmaf(n, hi, 0.028));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 px = 1.0 / u_res;
  if (u_frame < 1.0) {
    gl_FragColor = vec4(smoothstep(0.55, 0.8, fbm(uv * 7.0 + 3.7)), 0.0, 0.0, 1.0);
    return;
  }

  float here = texture2D(u_prev, uv).r;

  // Inner filling m: centre + one ring (the "cell body")
  float msum = here;
  for (int i = 0; i < 8; i++) {
    float a = float(i) / 8.0 * PI2;
    msum += texture2D(u_prev, uv + vec2(cos(a), sin(a)) * 2.6 * px).r;
  }
  float m = msum / 9.0;

  // Outer filling n: two rings (the "neighbourhood")
  float nsum = 0.0;
  for (int i = 0; i < 10; i++) {
    float a = (float(i) + 0.5) / 10.0 * PI2;
    nsum += texture2D(u_prev, uv + vec2(cos(a), sin(a)) * 6.0 * px).r * 0.8;
  }
  for (int i = 0; i < 14; i++) {
    float a = float(i) / 14.0 * PI2;
    nsum += texture2D(u_prev, uv + vec2(cos(a), sin(a)) * 9.5 * px).r * 1.2;
  }
  float n = nsum / 24.8;

  // Smooth time stepping — life speeds up on the downbeat
  float dt = 0.28 + 0.1 * u_beat;
  float next = clamp(here + dt * (2.0 * rule(n, m) - 1.0), 0.0, 1.0);

  // The click is the feeding hand
  vec2 pd = (uv - u_pointer.xy) * vec2(u_res.x / u_res.y, 1.0);
  next = max(next, u_pointer.z * exp(-dot(pd, pd) * 500.0));

  gl_FragColor = vec4(next, 0.0, 0.0, 1.0);
}
`,
    },
    {
      target: "screen",
      inputs: ["life"],
      source: `
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float f = texture2D(u_life, uv).r;
  // Membrane shading: the rim of every amoeba glows
  float rim = f * (1.0 - f) * 4.0;
  vec3 col = mix(u_accent * 0.06, u_accent, smoothstep(0.1, 0.65, f));
  col += mix(u_accent, vec3(1.0), 0.7) * rim * rim * (0.5 + 0.5 * u_beat);
  gl_FragColor = vec4(col, 1.0);
}
`,
    },
  ],
};

/**
 * Lenia (Bert Chan): continuous Life with a smooth ring kernel and a bell
 * growth curve — the crown of the cellular-automata family. Nothing here is
 * drawn; colonies breathe, pulse and reorganise entirely on their own.
 * A click adds living mass under the cursor.
 */
const LENIA: EffectSpec = {
  id: "lenia",
  passes: [
    {
      target: "world",
      feedback: true,
      iterations: 2,
      scale: 0.4,
      precision: "high",
      source: `
const float PI2 = 6.2831853;

float bell(float x, float mu, float s) {
  float d = (x - mu) / s;
  return exp(-d * d * 0.5);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 px = 1.0 / u_res;
  if (u_frame < 1.0) {
    // Patchy soup at mid concentration — Lenia's favourite starting point
    float f0 = smoothstep(0.5, 0.85, fbm(uv * 5.0)) *
      (0.4 + 0.4 * noise(uv * 30.0));
    gl_FragColor = vec4(f0, 0.0, 0.0, 1.0);
    return;
  }

  float here = texture2D(u_prev, uv).r;

  // The ring kernel, sampled on four circles. Weights = bell(r/R; 0.5, 0.15)
  // times circumference, normalised below — a smooth halo, not a disc.
  float acc = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) / 8.0 * PI2;
    acc += texture2D(u_prev, uv + vec2(cos(a), sin(a)) * 4.2 * px).r * 2.55;
  }
  for (int i = 0; i < 10; i++) {
    float a = (float(i) + 0.5) / 10.0 * PI2;
    acc += texture2D(u_prev, uv + vec2(cos(a), sin(a)) * 6.0 * px).r * 6.0;
  }
  for (int i = 0; i < 12; i++) {
    float a = float(i) / 12.0 * PI2;
    acc += texture2D(u_prev, uv + vec2(cos(a), sin(a)) * 7.8 * px).r * 4.73;
  }
  for (int i = 0; i < 14; i++) {
    float a = (float(i) + 0.5) / 14.0 * PI2;
    acc += texture2D(u_prev, uv + vec2(cos(a), sin(a)) * 10.2 * px).r * 0.67;
  }
  float u = acc / 146.3;

  // Growth: alive around u = 0.15, dying everywhere else
  float g = bell(u, 0.15, 0.022) * 2.0 - 1.0;
  float dt = 0.12 + 0.05 * u_beat;
  float next = clamp(here + dt * g, 0.0, 1.0);

  // A click is a graft of living tissue
  vec2 pd = (uv - u_pointer.xy) * vec2(u_res.x / u_res.y, 1.0);
  next = max(next, u_pointer.z * 0.6 * exp(-dot(pd, pd) * 400.0));

  gl_FragColor = vec4(next, 0.0, 0.0, 1.0);
}
`,
    },
    {
      target: "screen",
      inputs: ["world"],
      source: `
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float f = texture2D(u_world, uv).r;
  // Heat-map: void → accent → white-hot core
  vec3 col = mix(u_accent * 0.05, u_accent, smoothstep(0.02, 0.45, f));
  col = mix(col, vec3(1.0, 0.97, 0.9), smoothstep(0.55, 0.95, f) * 0.85);
  col *= 0.8 + 0.35 * u_beat;
  gl_FragColor = vec4(col, 1.0);
}
`,
    },
  ],
};

export const TRIP_PRESETS: TripPreset[] = [
  {
    id: "wormhole",
    label: "Wormhole 🕳️",
    blurb: "Video feedback — every frame eats the last one.",
    spec: WORMHOLE,
  },
  {
    id: "acid",
    label: "Acid 🧪",
    blurb: "Reaction-diffusion. Nothing is animated, it all grows.",
    spec: ACID,
  },
  {
    id: "mandelbulb",
    label: "Mandelbulb 🌀",
    blurb: "A raymarched 3D fractal. Your GPU will notice.",
    spec: MANDELBULB,
  },
  {
    id: "inkflow",
    label: "Ink flow 🖋️",
    blurb: "Ink in a swirling current that never drains.",
    spec: INKFLOW,
  },
  {
    id: "cyclic",
    label: "Spirals 🌪️",
    blurb: "Rock-paper-scissors between twelve states. Galaxies happen. Click to stir.",
    spec: CYCLIC,
  },
  {
    id: "kaliset",
    label: "Cathedral 🕍",
    blurb: "One folded formula from the demoscene. Your pointer bends it.",
    spec: KALISET,
  },
  {
    id: "smoothlife",
    label: "Primordial 🧫",
    blurb: "SmoothLife — Conway's Life gone continuous. Click to feed the soup.",
    spec: SMOOTHLIFE,
  },
  {
    id: "lenia",
    label: "Lenia 🧬",
    blurb: "Continuous life. Nothing is animated — it LIVES. Click to graft mass.",
    spec: LENIA,
  },
];

export function getTripPreset(id: string): TripPreset | null {
  return TRIP_PRESETS.find((p) => p.id === id) ?? null;
}
