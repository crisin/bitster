import type { GameRecap, RoundRecord } from "@/game/types";
import { DEFAULT_SETTINGS, EMPTY_STATS, RECAP_VERSION } from "@/game/types";
import { describe, expect, it } from "vitest";
import {
  bestRound,
  computeAllTime,
  decadeHistogram,
  findNemesis,
  knownPlayers,
  songLeaderboard,
  tokenLedger,
  type Who,
} from "./aggregate";
import type { StoredGame, StoredRound } from "./types";

const ME = "peer-me";
const RIVAL = "peer-rival";
const WHO: Who = { identityId: "spotify:me", localName: null };

function round(over: Partial<StoredRound> = {}): StoredRound {
  return {
    round: 1,
    song: { id: "s1", name: "Song", artist: "Artist", year: 1985 },
    activePlayerId: ME,
    activePlayerName: "Me",
    outcome: "placed",
    position: 0,
    correct: true,
    placeMs: 4_000,
    guess: null,
    buzz: null,
    tokens: [],
    rerolls: [],
    passes: [],
    ...over,
  };
}

function game(over: {
  id?: string;
  rounds?: StoredRound[];
  winnerId?: string | null;
  endedReason?: GameRecap["endedReason"];
  demo?: boolean;
  identityId?: string;
  localName?: string | null;
  storedAt?: number;
}): StoredGame {
  const localName = over.localName ?? null;
  return {
    id: over.id ?? "ROOM01:1",
    identityId: over.identityId ?? "spotify:me",
    storedAt: over.storedAt ?? 1,
    mine: [{ playerId: ME, localName }],
    recap: {
      version: RECAP_VERSION,
      roomCode: "ROOM01",
      hostId: ME,
      startedAt: 0,
      endedAt: 1,
      endedReason: over.endedReason ?? "win",
      winnerId: over.winnerId === undefined ? ME : over.winnerId,
      playlistName: "Playlist",
      demo: over.demo ?? false,
      settings: DEFAULT_SETTINGS,
      players: [
        {
          id: ME,
          name: "Me",
          score: 10,
          timelineLength: 10,
          penalties: 0,
          isLocal: false,
          stats: { ...EMPTY_STATS },
        },
        {
          id: RIVAL,
          name: "Rival",
          score: 4,
          timelineLength: 4,
          penalties: 1,
          isLocal: false,
          stats: { ...EMPTY_STATS },
        },
      ],
      rounds: over.rounds ?? [round()],
    },
  };
}

describe("computeAllTime", () => {
  it("returns zeroed stats without dividing by zero", () => {
    const stats = computeAllTime([], WHO);
    expect(stats.games).toBe(0);
    expect(stats.winRate).toBe(0);
    expect(stats.hitRate).toBe(0);
    expect(stats.medianPlaceMs).toBeNull();
  });

  it("counts a win only when I actually won a game that finished", () => {
    const won = game({ id: "a", winnerId: ME });
    const lost = game({ id: "b", winnerId: RIVAL });
    // Abandoned games never count as a win, even with me listed as winner
    const abandoned = game({
      id: "c",
      winnerId: ME,
      endedReason: "abandoned",
    });
    const stats = computeAllTime([won, lost, abandoned], WHO);
    expect(stats.games).toBe(3);
    expect(stats.wins).toBe(1);
    expect(stats.winRate).toBeCloseTo(1 / 3);
  });

  it("excludes demo games unless asked for them", () => {
    const games = [game({ id: "a" }), game({ id: "b", demo: true })];
    expect(computeAllTime(games, WHO).games).toBe(1);
    expect(computeAllTime(games, WHO, { includeDemo: true }).games).toBe(2);
  });

  it("counts placement stats only for rounds I played", () => {
    const games = [
      game({
        rounds: [
          round({ round: 1, correct: true }),
          round({ round: 2, correct: false }),
          round({ round: 3, activePlayerId: RIVAL, correct: true }),
        ],
      }),
    ];
    const stats = computeAllTime(games, WHO);
    expect(stats.rounds).toBe(2);
    expect(stats.correct).toBe(1);
    expect(stats.hitRate).toBe(0.5);
  });

  it("attributes steals via the buzzer, not the active player", () => {
    const games = [
      game({
        rounds: [
          round({
            round: 1,
            activePlayerId: RIVAL,
            buzz: {
              playerId: ME,
              playerName: "Me",
              position: 1,
              stolen: true,
              penalty: false,
            },
          }),
          round({
            round: 2,
            activePlayerId: RIVAL,
            buzz: {
              playerId: ME,
              playerName: "Me",
              position: 0,
              stolen: false,
              penalty: true,
            },
          }),
        ],
      }),
    ];
    const stats = computeAllTime(games, WHO);
    expect(stats.steals).toBe(1);
    expect(stats.stealsAttempted).toBe(2);
    expect(stats.stealRate).toBe(0.5);
    // Those rounds were not mine to place
    expect(stats.rounds).toBe(0);
  });

  it("tracks skips, timeouts and guessed tokens", () => {
    const games = [
      game({
        rounds: [
          round({ round: 1, outcome: "skipped", correct: null }),
          round({ round: 2, outcome: "timeout", correct: false }),
          round({
            round: 3,
            guess: {
              title: "Song",
              artist: "Artist",
              year: 1985,
              titleCorrect: true,
              artistCorrect: true,
              yearCorrect: true,
              tokens: 2,
            },
          }),
        ],
      }),
    ];
    const stats = computeAllTime(games, WHO);
    expect(stats.skips).toBe(1);
    expect(stats.timeouts).toBe(1);
    expect(stats.tokensGuessed).toBe(2);
  });

  it("ignores games belonging to a different identity", () => {
    const other = game({ id: "x", identityId: "spotify:someone-else" });
    expect(computeAllTime([other], WHO).games).toBe(0);
  });

  it("separates pass-and-play seats on the same device", () => {
    const mine = game({ id: "a", localName: null });
    const karl = game({ id: "b", localName: "Karl" });
    expect(computeAllTime([mine, karl], WHO).games).toBe(1);
    expect(
      computeAllTime([mine, karl], {
        identityId: "spotify:me",
        localName: "Karl",
      }).games,
    ).toBe(1);
  });
});

describe("decadeHistogram", () => {
  it("buckets by decade and skips unrevealed years", () => {
    const games = [
      game({
        rounds: [
          round({ round: 1, song: { id: "a", name: "A", artist: "X", year: 1975 } }),
          round({ round: 2, song: { id: "b", name: "B", artist: "X", year: 1979 }, correct: false }),
          round({ round: 3, song: { id: "c", name: "C", artist: "X", year: 0 } }),
          round({ round: 4, song: { id: "d", name: "D", artist: "X", year: 1991 } }),
        ],
      }),
    ];
    const buckets = decadeHistogram(games, WHO);
    expect(buckets).toEqual([
      { decade: 1970, seen: 2, hit: 1 },
      { decade: 1990, seen: 1, hit: 1 },
    ]);
  });
});

describe("findNemesis", () => {
  it("returns whoever stole the most cards off me", () => {
    const games = [
      game({
        rounds: [
          round({
            round: 1,
            buzz: {
              playerId: RIVAL,
              playerName: "Rival",
              position: 0,
              stolen: true,
              penalty: false,
            },
          }),
          round({
            round: 2,
            buzz: {
              playerId: RIVAL,
              playerName: "Rival",
              position: 0,
              stolen: true,
              penalty: false,
            },
          }),
        ],
      }),
    ];
    expect(findNemesis(games, WHO)).toEqual({
      name: "Rival",
      stealsAgainstMe: 2,
      stealsByMe: 0,
    });
  });

  it("returns null when nobody ever stole from me", () => {
    expect(findNemesis([game({})], WHO)).toBeNull();
  });
});

describe("bestRound", () => {
  it("picks the fastest CORRECT placement and ignores unmeasured ones", () => {
    const games = [
      game({
        rounds: [
          round({ round: 1, placeMs: 9_000 }),
          round({ round: 2, placeMs: 1_200 }),
          round({ round: 3, placeMs: 300, correct: false }),
          round({ round: 4, placeMs: null }),
        ],
      }),
    ];
    expect(bestRound(games, WHO)?.round.placeMs).toBe(1_200);
  });
});

describe("songLeaderboard", () => {
  it("counts how often a song came up and how often it beat me", () => {
    const games = [
      game({
        rounds: [
          round({ round: 1, song: { id: "s1", name: "A", artist: "X", year: 1980 } }),
          round({
            round: 2,
            song: { id: "s1", name: "A", artist: "X", year: 1980 },
            correct: false,
          }),
          round({ round: 3, song: { id: "s2", name: "B", artist: "Y", year: 1990 } }),
        ],
      }),
    ];
    const board = songLeaderboard(games, WHO);
    expect(board[0].song.id).toBe("s1");
    expect(board[0].seen).toBe(2);
    expect(board[0].missed).toBe(1);
  });
});

describe("knownPlayers", () => {
  it("lists the device owner first, then the pass-and-play seats", () => {
    const games = [
      game({ id: "a", localName: null }),
      game({ id: "b", localName: "Karl" }),
      game({ id: "c", localName: "Anna" }),
    ];
    expect(knownPlayers(games, "spotify:me").map((w) => w.localName)).toEqual([
      null,
      "Anna",
      "Karl",
    ]);
  });
});

/** Guard: the stored round shape must stay assignable from the wire shape */
describe("stored types", () => {
  it("accepts a RoundRecord shape with the song reduced", () => {
    const wire: RoundRecord = {
      round: 1,
      song: {
        id: "s1",
        uri: "spotify:track:1",
        name: "Song",
        artist: "Artist",
        year: 1985,
      },
      activePlayerId: ME,
      activePlayerName: "Me",
      outcome: "placed",
      position: 0,
      correct: true,
      placeMs: 1000,
      guess: null,
      buzz: null,
      tokens: [],
      rerolls: [],
      passes: [],
    };
    const stored: StoredRound = {
      ...wire,
      song: {
        id: wire.song.id,
        name: wire.song.name,
        artist: wire.song.artist,
        year: wire.song.year,
      },
    };
    expect(stored.song).not.toHaveProperty("uri");
  });
});

describe("tokenLedger", () => {
  const spend = (playerId: string, name: string, reason: "buzz" | "skip") => ({
    playerId,
    playerName: name,
    delta: -1,
    reason,
  });
  const earn = (
    playerId: string,
    name: string,
    reason: "guess-song" | "guess-year",
  ) => ({ playerId, playerName: name, delta: 1, reason });

  it("splits earned from spent and nets them out", () => {
    const rounds = [
      round({
        tokens: [
          earn(ME, "Me", "guess-song"),
          earn(ME, "Me", "guess-year"),
          spend(RIVAL, "Rival", "buzz"),
        ],
      }),
      round({ round: 2, tokens: [spend(ME, "Me", "skip")] }),
    ];

    const [me, rival] = tokenLedger(rounds);
    expect(me).toMatchObject({
      playerId: ME,
      earned: 2,
      spent: 1,
      net: 1,
      guessedSong: 1,
      guessedYear: 1,
      skips: 1,
    });
    expect(rival).toMatchObject({ playerId: RIVAL, earned: 0, spent: 1, net: -1, buzzes: 1 });
  });

  it("survives rounds recorded before the log tracked tokens", () => {
    // Straight off disk, where nothing validates the per-round shape
    const ancient = { ...round(), tokens: undefined } as unknown as StoredRound;
    expect(tokenLedger([ancient])).toEqual([]);
  });

  it("takes the first real name when an older record has none", () => {
    const rounds = [
      round({ tokens: [{ ...earn(ME, "", "guess-song") }] }),
      round({ round: 2, tokens: [earn(ME, "Me", "guess-year")] }),
    ];
    expect(tokenLedger(rounds)[0].name).toBe("Me");
  });
});
