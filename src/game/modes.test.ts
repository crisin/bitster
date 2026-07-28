import { describe, expect, it } from "vitest";
import { CUSTOM_MODE_ID, describeRules, GAME_MODES, getMode, modeFor } from "./modes";
import type { GameSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";

function settingsFor(modeId: string): GameSettings {
  const mode = getMode(modeId);
  if (!mode) throw new Error(`unknown mode ${modeId}`);
  return { ...DEFAULT_SETTINGS, winScore: mode.winScore, rules: mode.rules };
}

describe("game modes", () => {
  it("recognises every preset it produced", () => {
    for (const mode of GAME_MODES) {
      expect(modeFor(settingsFor(mode.id))?.id).toBe(mode.id);
    }
  });

  it("has no two presets with identical settings", () => {
    // Two modes that resolve to the same rules would make the picker lie:
    // selecting one would highlight the other
    const seen = new Set(
      GAME_MODES.map((m) => JSON.stringify({ w: m.winScore, r: m.rules })),
    );
    expect(seen.size).toBe(GAME_MODES.length);
  });

  it("falls out of every preset as soon as one dial moves", () => {
    const tweaked = settingsFor("classic");
    tweaked.rules = {
      ...tweaked.rules,
      guess: { ...tweaked.rules.guess, yearTolerance: 4 },
    };
    expect(modeFor(tweaked)).toBeNull();
  });

  it("keeps the default settings on a real mode", () => {
    // Otherwise a fresh room would open as "Custom", which reads like a bug
    expect(modeFor(DEFAULT_SETTINGS)).not.toBeNull();
  });

  it("never offers Custom as a preset", () => {
    expect(GAME_MODES.some((m) => m.id === CUSTOM_MODE_ID)).toBe(false);
    expect(getMode(CUSTOM_MODE_ID)).toBeNull();
  });

  it("says out loud what the rules do", () => {
    const summary = describeRules(settingsFor("connoisseur")).join(" · ");
    expect(summary).toMatch(/title and artist/);
    expect(summary).toMatch(/no rerolls/);
    expect(summary).toMatch(/costs a point/);

    const party = describeRules(settingsFor("party")).join(" · ");
    expect(party).toMatch(/title or artist/);
    expect(party).toMatch(/free rerolls/);
    expect(party).toMatch(/±2/);

    const quiet = describeRules(settingsFor("solitaire")).join(" · ");
    expect(quiet).toMatch(/no bitster/);
  });
});
