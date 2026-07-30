import type { GamePulse } from "@/hooks/useGamePulse";
import { describe, expect, it } from "vitest";
import {
  CLICK_MS,
  FLASH_MS,
  pointerUniform,
  reactToGame,
  URGENCY_WINDOW_MS,
} from "./reaction";

const NOW = 1_700_000_000_000;

function pulse(over: Partial<GamePulse> = {}): GamePulse {
  return { phase: 0.25, deadlineAt: null, result: 0, resultAt: 0, ...over };
}

const BASE = {
  intensity: 0.5,
  beat: 0.2,
  accent: [0.5, 0.1, 0.9] as const,
  now: NOW,
  still: false,
};

describe("shader reaction", () => {
  it("leaves a calm round exactly as the dials set it", () => {
    const out = reactToGame(pulse(), BASE);
    expect(out.intensity).toBe(0.5);
    expect(out.beat).toBe(0.2);
    expect(out.timeScale).toBe(1);
    expect(out.accent).toEqual([0.5, 0.1, 0.9]);
  });

  it("winds the layer up as a countdown runs out", () => {
    const calm = reactToGame(pulse({ deadlineAt: null }), BASE);
    const panic = reactToGame(pulse({ deadlineAt: NOW }), BASE);
    expect(panic.intensity).toBeGreaterThan(calm.intensity);
    expect(panic.timeScale).toBeGreaterThan(calm.timeScale);
    expect(panic.game[1]).toBe(1);
    // Urgency is derived per frame now — halfway into the window sits between
    const mid = reactToGame(
      pulse({ deadlineAt: NOW + URGENCY_WINDOW_MS / 2 }),
      BASE,
    );
    expect(mid.game[1]).toBeCloseTo(0.5);
    // A deadline still far beyond the window reads as calm
    const far = reactToGame(
      pulse({ deadlineAt: NOW + URGENCY_WINDOW_MS * 2 }),
      BASE,
    );
    expect(far.game[1]).toBe(0);
  });

  it("never pushes intensity past what a shader expects", () => {
    const out = reactToGame(pulse({ deadlineAt: NOW }), { ...BASE, intensity: 1 });
    expect(out.intensity).toBe(1);
  });

  it("flashes green on a right placement and red on a wrong one", () => {
    const right = reactToGame(
      pulse({ result: 1, resultAt: NOW }),
      BASE,
    );
    const wrong = reactToGame(pulse({ result: -1, resultAt: NOW }), BASE);
    // Fresh verdict = full tint
    expect(right.accent[1]).toBeGreaterThan(BASE.accent[1]);
    expect(wrong.accent[0]).toBeGreaterThan(BASE.accent[0]);
    expect(right.accent[1]).toBeGreaterThan(wrong.accent[1]);
    // ...and it beats the metronome while it lasts
    expect(right.beat).toBeGreaterThan(BASE.beat);
  });

  it("fades the flash out and stops exactly at the end", () => {
    const at = (dt: number) =>
      reactToGame(pulse({ result: 1, resultAt: NOW - dt }), BASE);
    expect(at(0).beat).toBeGreaterThan(at(FLASH_MS / 2).beat);
    expect(at(FLASH_MS).beat).toBe(BASE.beat);
    expect(at(FLASH_MS).accent).toEqual([...BASE.accent]);
    // A stale verdict from a previous game must not tint anything
    expect(at(60_000).accent).toEqual([...BASE.accent]);
  });

  it("ignores a verdict that is somehow in the future", () => {
    const out = reactToGame(pulse({ result: -1, resultAt: NOW + 5_000 }), BASE);
    expect(out.accent).toEqual([...BASE.accent]);
  });

  it("maps the pointer to the uniform contract", () => {
    const state = { x: 0.2, y: 0.8, clickAt: NOW, active: true };
    // Fresh click = full impulse
    expect(pointerUniform(state, NOW)).toEqual([0.2, 0.8, 1, 1]);
    // Decays over CLICK_MS and stops exactly at the end
    const mid = pointerUniform(state, NOW + CLICK_MS / 2)[2];
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(pointerUniform(state, NOW + CLICK_MS)[2]).toBe(0);
    // Never clicked and future clicks contribute nothing
    expect(pointerUniform({ ...state, clickAt: 0 }, NOW)[2]).toBe(0);
    expect(pointerUniform({ ...state, clickAt: NOW + 5000 }, NOW)[2]).toBe(0);
    // Off-screen pointer flags w = 0 but keeps its last position
    expect(pointerUniform({ ...state, active: false }, NOW)).toEqual([
      0.2, 0.8, 1, 0,
    ]);
  });

  it("never animates when the player asked for no motion", () => {
    const out = reactToGame(
      pulse({ deadlineAt: NOW, result: -1, resultAt: NOW }),
      { ...BASE, still: true },
    );
    // Reduced motion outranks every dramatic thing the game wants
    expect(out.beat).toBe(0);
    expect(out.timeScale).toBe(1);
    expect(out.intensity).toBe(BASE.intensity);
    expect(out.accent).toEqual([...BASE.accent]);
    expect(out.game[1]).toBe(0);
  });
});
