import type { GamePulse } from "@/hooks/useGamePulse";
import { describe, expect, it } from "vitest";
import { FLASH_MS, reactToGame } from "./reaction";

const NOW = 1_700_000_000_000;

function pulse(over: Partial<GamePulse> = {}): GamePulse {
  return { phase: 0.25, urgency: 0, result: 0, resultAt: 0, ...over };
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
    const calm = reactToGame(pulse({ urgency: 0 }), BASE);
    const panic = reactToGame(pulse({ urgency: 1 }), BASE);
    expect(panic.intensity).toBeGreaterThan(calm.intensity);
    expect(panic.timeScale).toBeGreaterThan(calm.timeScale);
    expect(panic.game[1]).toBe(1);
  });

  it("never pushes intensity past what a shader expects", () => {
    const out = reactToGame(pulse({ urgency: 1 }), { ...BASE, intensity: 1 });
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

  it("never animates when the player asked for no motion", () => {
    const out = reactToGame(
      pulse({ urgency: 1, result: -1, resultAt: NOW }),
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
