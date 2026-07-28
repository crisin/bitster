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
