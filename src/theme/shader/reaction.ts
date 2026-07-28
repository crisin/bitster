import type { GamePulse } from "@/hooks/useGamePulse";

/**
 * How the game bends the shader uniforms.
 *
 * Split out of the render loop on purpose: this is the only part of the effect
 * layer with real behaviour in it, and a render loop driven by
 * requestAnimationFrame cannot be tested. Everything here is pure.
 *
 * The mapping goes onto the uniforms every preset ALREADY respects — intensity,
 * beat, accent — so all twelve shaders react without one of them knowing that a
 * game exists. `u_game` is passed along on top for presets that want detail.
 */

/** How long a right/wrong verdict keeps colouring the screen */
export const FLASH_MS = 900;

/** How long a click/tap keeps punching the shaders */
export const CLICK_MS = 600;

/** What the layer tracks about the pointer — written by listeners, read per frame */
export interface PointerState {
  /** 0..1 from the left edge */
  x: number;
  /** 0..1 from the BOTTOM — GL's convention, so shaders subtract directly */
  y: number;
  /** Epoch ms of the last click/tap, 0 = never */
  clickAt: number;
  /** Pointer is currently on the screen */
  active: boolean;
}

export const IDLE_POINTER: PointerState = {
  x: 0.5,
  y: 0.5,
  clickAt: 0,
  active: false,
};

/**
 * The u_pointer uniform: xy = position, z = click impulse decaying 1→0,
 * w = 1 while the pointer is on screen. Pure for the same reason the game
 * reaction is — this is behaviour, and behaviour gets tests.
 */
export function pointerUniform(
  pointer: PointerState,
  now: number,
): [number, number, number, number] {
  const age = pointer.clickAt === 0 ? Infinity : now - pointer.clickAt;
  const click =
    age >= CLICK_MS || age < 0 ? 0 : Math.pow(1 - age / CLICK_MS, 2);
  return [pointer.x, pointer.y, click, pointer.active ? 1 : 0];
}

const RIGHT_TINT: readonly [number, number, number] = [0.25, 1, 0.55];
const WRONG_TINT: readonly [number, number, number] = [1, 0.25, 0.3];

export interface ShaderInputs {
  /** 0..1 from the intensity dial */
  intensity: number;
  /** 0..1 from the metronome */
  beat: number;
  accent: readonly [number, number, number];
  /** Wall clock, injected so this stays pure */
  now: number;
  /** True when the user asked for no motion — the game must not override that */
  still: boolean;
}

export interface ShaderUniforms {
  intensity: number;
  beat: number;
  accent: [number, number, number];
  /** Multiplier on the time step — a countdown speeds the whole world up */
  timeScale: number;
  game: [number, number, number];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function reactToGame(
  pulse: GamePulse,
  input: ShaderInputs,
): ShaderUniforms {
  // Reduced motion wins over everything the game wants to do
  if (input.still) {
    return {
      intensity: input.intensity,
      beat: 0,
      accent: [...input.accent] as [number, number, number],
      timeScale: 1,
      game: [pulse.phase, 0, 0],
    };
  }

  const urgency = Math.min(1, Math.max(0, pulse.urgency));
  // Squared decay: a hard hit that fades fast, not a slow wash
  const age = pulse.resultAt === 0 ? Infinity : input.now - pulse.resultAt;
  const flash =
    age >= FLASH_MS || age < 0 ? 0 : Math.pow(1 - age / FLASH_MS, 2);

  const tint = pulse.result >= 0 ? RIGHT_TINT : WRONG_TINT;
  return {
    intensity: Math.min(1, input.intensity + urgency * 0.35),
    // A verdict outranks the metronome — briefly
    beat: Math.max(input.beat, flash),
    accent: [
      lerp(input.accent[0], tint[0], flash),
      lerp(input.accent[1], tint[1], flash),
      lerp(input.accent[2], tint[2], flash),
    ],
    timeScale: 1 + urgency * 0.9,
    game: [pulse.phase, urgency, pulse.result],
  };
}
