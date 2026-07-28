import { describe, expect, it, vi } from "vitest";

// storage.ts → logger → expo modules that don't parse in node
vi.mock("expo-file-system", () => ({
  Paths: { cache: "/tmp/" },
  File: vi.fn().mockImplementation(() => ({ uri: "/tmp/test.log", text: "" })),
}));
vi.mock("expo-sharing", () => ({ shareAsync: vi.fn() }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

import type { GameRecap } from "@/game/types";
import { DEFAULT_SETTINGS, EMPTY_STATS, RECAP_VERSION } from "@/game/types";
import {
  applyRingBuffer,
  parseHistoryFile,
  rewriteIdentity,
  toStoredGame,
} from "./storage";
import type { StoredGame } from "./types";
import { HISTORY_SCHEMA, MAX_GAMES, MAX_ROUNDS_STORED } from "./types";

function recap(over: Partial<GameRecap> = {}): GameRecap {
  return {
    version: RECAP_VERSION,
    roomCode: "ROOM01",
    hostId: "host-1",
    startedAt: 0,
    endedAt: 1_000,
    endedReason: "win",
    winnerId: "host-1",
    playlistName: "Playlist",
    demo: false,
    settings: DEFAULT_SETTINGS,
    players: [
      {
        id: "host-1",
        name: "Alice",
        score: 10,
        timelineLength: 10,
        penalties: 0,
        isLocal: false,
        stats: { ...EMPTY_STATS },
      },
    ],
    rounds: [
      {
        round: 1,
        song: {
          id: "s1",
          uri: "spotify:track:1",
          name: "Song",
          artist: "Artist",
          year: 1985,
          imageUrl: "https://example.test/a.jpg",
          albumName: "Album",
          popularity: 55,
        },
        activePlayerId: "host-1",
        activePlayerName: "Alice",
        outcome: "placed",
        position: 0,
        correct: true,
        placeMs: 3_000,
        guess: null,
        buzz: null,
      },
    ],
    ...over,
  };
}

function entry(id: string, storedAt: number, identityId = "spotify:me"): StoredGame {
  return {
    id,
    identityId,
    storedAt,
    mine: [{ playerId: "host-1", localName: null }],
    recap: { ...recap(), rounds: [] },
  };
}

describe("toStoredGame", () => {
  it("drops everything a statistic will never read", () => {
    const stored = toStoredGame(
      recap(),
      [{ playerId: "host-1", localName: null }],
      "spotify:me",
      1234,
    );
    const song = stored.recap.rounds[0].song;
    expect(song).toEqual({
      id: "s1",
      name: "Song",
      artist: "Artist",
      year: 1985,
    });
    expect(song).not.toHaveProperty("uri");
    expect(song).not.toHaveProperty("imageUrl");
    expect(stored.storedAt).toBe(1234);
    expect(stored.id).toBe("ROOM01:1000");
  });

  it("truncates a pathologically long game", () => {
    const many = Array.from({ length: MAX_ROUNDS_STORED + 20 }, (_, i) => ({
      ...recap().rounds[0],
      round: i + 1,
    }));
    const stored = toStoredGame(recap({ rounds: many }), [], "spotify:me", 1);
    expect(stored.recap.rounds).toHaveLength(MAX_ROUNDS_STORED);
  });
});

describe("parseHistoryFile", () => {
  it("returns an empty file for null, garbage and an unknown schema", () => {
    expect(parseHistoryFile(null).entries).toEqual([]);
    expect(parseHistoryFile("{ not json").entries).toEqual([]);
    expect(
      parseHistoryFile(JSON.stringify({ schema: 99, entries: [entry("a", 1)] }))
        .entries,
    ).toEqual([]);
    expect(parseHistoryFile(JSON.stringify({ schema: HISTORY_SCHEMA })).entries)
      .toEqual([]);
  });

  it("round-trips a valid file", () => {
    const file = { schema: HISTORY_SCHEMA, entries: [entry("a", 1)] };
    expect(parseHistoryFile(JSON.stringify(file)).entries).toHaveLength(1);
  });
});

describe("applyRingBuffer", () => {
  it("keeps the newest games and drops the rest", () => {
    const many = Array.from({ length: MAX_GAMES + 10 }, (_, i) =>
      entry(`g${i}`, i),
    );
    const kept = applyRingBuffer(many);
    expect(kept).toHaveLength(MAX_GAMES);
    // Newest first
    expect(kept[0].storedAt).toBe(MAX_GAMES + 9);
  });

  it("dedupes a re-delivered recap by id", () => {
    const kept = applyRingBuffer([entry("same", 2), entry("same", 1)]);
    expect(kept).toHaveLength(1);
    expect(kept[0].storedAt).toBe(2);
  });

  it("never empties itself entirely, even over the byte budget", () => {
    const huge = {
      ...entry("big", 1),
      recap: { ...recap(), rounds: [] },
    };
    expect(applyRingBuffer([huge])).toHaveLength(1);
  });
});

describe("rewriteIdentity", () => {
  it("moves provisional entries and leaves the others alone", () => {
    const entries = [
      entry("a", 1, "device:abc"),
      entry("b", 2, "spotify:someone-else"),
    ];
    const moved = rewriteIdentity(entries, "device:abc", "spotify:me");
    expect(moved[0].identityId).toBe("spotify:me");
    expect(moved[1].identityId).toBe("spotify:someone-else");
  });
});
