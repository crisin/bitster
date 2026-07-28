import { describe, expect, it, vi } from "vitest";

// randomPool.ts → auth/logger → expo modules that don't parse in node
vi.mock("expo-file-system", () => ({
  Paths: { cache: "/tmp/" },
  File: vi.fn().mockImplementation(() => ({ uri: "/tmp/test.log", text: "" })),
}));
vi.mock("expo-sharing", () => ({ shareAsync: vi.fn() }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock("expo-auth-session", () => ({}));
vi.mock("expo-web-browser", () => ({}));
vi.mock("expo-crypto", () => ({}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

import type { Track } from "@/streaming/types";
import { applySamplingCaps } from "./randomPool";

function track(over: Partial<Track> & { id: string }): Track {
  return {
    uri: `spotify:track:${over.id}`,
    name: `Song ${over.id}`,
    artist: "Artist",
    year: 1985,
    ...over,
  };
}

describe("applySamplingCaps", () => {
  it("keeps at most two songs per primary artist", () => {
    const candidates = Array.from({ length: 6 }, (_, i) =>
      track({ id: `a${i}`, artist: "Queen", year: 1970 + i * 10 }),
    );
    const pool = applySamplingCaps(candidates, 20);
    expect(pool).toHaveLength(2);
  });

  it("treats a featured credit as the same primary artist", () => {
    const pool = applySamplingCaps(
      [
        track({ id: "1", artist: "Eminem", year: 2000 }),
        track({ id: "2", artist: "Eminem, Rihanna", year: 2010 }),
        track({ id: "3", artist: "Eminem, Dido", year: 2020 }),
      ],
      20,
    );
    expect(pool).toHaveLength(2);
  });

  it("stops one decade from swallowing the pool", () => {
    const candidates = Array.from({ length: 40 }, (_, i) =>
      track({ id: `d${i}`, artist: `Artist ${i}`, year: 2015 }),
    );
    const pool = applySamplingCaps(candidates, 20);
    // 35% of 20 = 7
    expect(pool.length).toBeLessThanOrEqual(7);
  });

  it("spreads across decades when the candidates allow it", () => {
    const decades = [1960, 1970, 1980, 1990, 2000, 2010];
    const candidates = decades.flatMap((decade, d) =>
      Array.from({ length: 5 }, (_, i) =>
        track({ id: `${decade}-${i}`, artist: `Artist ${d}-${i}`, year: decade + i }),
      ),
    );
    const pool = applySamplingCaps(candidates, 18);
    const seen = new Set(pool.map((t) => Math.floor(t.year / 10) * 10));
    expect(seen.size).toBeGreaterThan(2);
  });

  it("drops duplicates of the same track", () => {
    const pool = applySamplingCaps(
      [
        track({ id: "same", artist: "A" }),
        track({ id: "same", artist: "A" }),
        track({ id: "other", artist: "B" }),
      ],
      10,
    );
    expect(pool.map((t) => t.id)).toEqual(["same", "other"]);
  });

  it("throws away junk release years", () => {
    const pool = applySamplingCaps(
      [
        track({ id: "junk", year: 0, artist: "A" }),
        track({ id: "old", year: 1800, artist: "B" }),
        track({ id: "good", year: 1975, artist: "C" }),
      ],
      10,
    );
    expect(pool.map((t) => t.id)).toEqual(["good"]);
  });

  it("never returns more than asked for", () => {
    const candidates = Array.from({ length: 100 }, (_, i) =>
      track({ id: `t${i}`, artist: `Artist ${i}`, year: 1960 + (i % 60) }),
    );
    expect(applySamplingCaps(candidates, 12)).toHaveLength(12);
  });

  it("returns an empty pool for no candidates", () => {
    expect(applySamplingCaps([], 20)).toEqual([]);
  });
});
