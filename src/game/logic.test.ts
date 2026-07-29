import type { GameStateMeta } from "@/game/types";
import {
  DEFAULT_RULES,
  MAX_GUESS_TEXT,
  MAX_ROUND_ENTRIES,
  MAX_ROUNDS_PER_GAME,
} from "@/game/types";
import { describe, expect, it } from "vitest";
import {
  addPlayer,
  advanceTurn,
  appendRound,
  buildGameRecap,
  canBeChallenged,
  allChallengersPassed,
  buildGameState,
  checkPlacement,
  checkWinCondition,
  awardTokens,
  createRoom,
  evaluateGuess,
  forfeitPlacement,
  generateRoomCode,
  getCurrentPlayer,
  guessReward,
  handleBuzz,
  hasLiveChallengers,
  setPlayerConnected,
  skipSong,
  pickRandomSong,
  placeSong,
  recomputeScores,
  recordPass,
  removePlayer,
  resolveBuzz,
  startGame,
  undoPlacement,
} from "./logic";
import type { Room, Song } from "./types";

/** Fixed stamp — buildGameState must copy it verbatim and read no clock */
const TEST_META: GameStateMeta = {
  hostNow: 1_700_000_000_000,
  stateVersion: 7,
};

function makeSong(year: number, id?: string): Song {
  return {
    id: id ?? `song-${year}`,
    uri: `spotify:track:${id ?? year}`,
    name: `Song ${year}`,
    artist: `Artist ${year}`,
    year,
  };
}

function makeTestRoom(): Room {
  const room = createRoom("TEST01", "host-1", "Alice");
  return addPlayer(room, "peer-2", "Bob");
}

describe("generateRoomCode", () => {
  it("generates a 6-character code", () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(6);
  });

  it("only uses valid characters (no 0, 1, I, O)", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[A-Z2-9]+$/);
      expect(code).not.toMatch(/[01IO]/);
    }
  });

  it("generates different codes", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateRoomCode()));
    expect(codes.size).toBeGreaterThan(15);
  });
});

describe("createRoom", () => {
  it("creates a room with host as first player", () => {
    const room = createRoom("ABC123", "host-1", "Alice");
    expect(room.code).toBe("ABC123");
    expect(room.hostId).toBe("host-1");
    expect(room.players).toHaveLength(1);
    expect(room.players[0].name).toBe("Alice");
    expect(room.phase).toBe("lobby");
    expect(room.settings.winScore).toBe(10);
    expect(room.settings.maxPlayers).toBe(8);
  });

  it("accepts custom settings", () => {
    const room = createRoom("ABC123", "host-1", "Alice", { winScore: 5 });
    expect(room.settings.winScore).toBe(5);
    expect(room.settings.maxPlayers).toBe(8);
  });
});

describe("addPlayer", () => {
  it("adds a new player", () => {
    const room = createRoom("ABC123", "host-1", "Alice");
    const updated = addPlayer(room, "peer-2", "Bob");
    expect(updated.players).toHaveLength(2);
    expect(updated.players[1].name).toBe("Bob");
  });

  it("reconnects existing player by peer ID — updates name", () => {
    const room = createRoom("ABC123", "host-1", "Alice");
    const withBob = addPlayer(room, "peer-2", "Bob");
    const reconnected = addPlayer(withBob, "peer-2", "Bobby");
    expect(reconnected.players).toHaveLength(2);
    expect(reconnected.players[1].id).toBe("peer-2");
    expect(reconnected.players[1].name).toBe("Bobby");
  });

  it("throws when room is full", () => {
    let room = createRoom("ABC123", "host-1", "Alice", { maxPlayers: 2 });
    room = addPlayer(room, "peer-2", "Bob");
    expect(() => addPlayer(room, "peer-3", "Charlie")).toThrow("Room is full");
  });

  it("throws when game is finished", () => {
    let room = createRoom("ABC123", "host-1", "Alice");
    room = { ...room, phase: "finished" };
    expect(() => addPlayer(room, "peer-2", "Bob")).toThrow("already finished");
  });

  it("throws for a new player when game is in progress", () => {
    let room = makeTestRoom();
    room = { ...room, phase: "playing" };
    expect(() => addPlayer(room, "peer-3", "Charlie")).toThrow(
      "already in progress",
    );
  });

  it("still reconnects an existing player mid-game", () => {
    let room = makeTestRoom();
    room = { ...room, phase: "playing" };
    const reconnected = addPlayer(room, "peer-2", "Bob");
    expect(reconnected.players).toHaveLength(2);
  });
});

describe("local players", () => {
  it("adds a local player with the flag set", () => {
    let room = makeTestRoom();
    room = addPlayer(room, "local-abc", "Karl", true);
    const karl = room.players.find((p) => p.id === "local-abc");
    expect(karl?.isLocal).toBe(true);
    expect(room.players.filter((p) => p.isLocal)).toHaveLength(1);
  });

  it("defaults to non-local for regular joins", () => {
    const room = makeTestRoom();
    expect(room.players.every((p) => p.isLocal === false)).toBe(true);
  });

  it("carries isLocal into the broadcast state", () => {
    let room = makeTestRoom();
    room = addPlayer(room, "local-abc", "Karl", true);
    const state = buildGameState(room, TEST_META);
    expect(state.players.find((p) => p.id === "local-abc")?.isLocal).toBe(true);
    expect(state.players.find((p) => p.id === "host-1")?.isLocal).toBe(false);
  });
});

describe("removePlayer", () => {
  it("removes a player", () => {
    const room = makeTestRoom();
    const updated = removePlayer(room, "peer-2");
    expect(updated.players).toHaveLength(1);
  });

  it("transfers host when host leaves", () => {
    const room = makeTestRoom();
    const updated = removePlayer(room, "host-1");
    expect(updated.hostId).toBe("peer-2");
  });

  it("adjusts currentPlayerIndex when earlier player removed", () => {
    let room = makeTestRoom();
    room = addPlayer(room, "peer-3", "Charlie");
    room = { ...room, currentPlayerIndex: 2 };
    const updated = removePlayer(room, "host-1");
    expect(updated.currentPlayerIndex).toBe(1);
  });
});

describe("checkPlacement", () => {
  it("returns true for empty timeline", () => {
    expect(checkPlacement([], makeSong(2000), 0)).toBe(true);
  });

  it("returns true for correct placement at start", () => {
    const timeline = [makeSong(2000)];
    expect(checkPlacement(timeline, makeSong(1990), 0)).toBe(true);
  });

  it("returns true for correct placement at end", () => {
    const timeline = [makeSong(2000)];
    expect(checkPlacement(timeline, makeSong(2010), 1)).toBe(true);
  });

  it("returns true for correct placement in middle", () => {
    const timeline = [makeSong(1990), makeSong(2010)];
    expect(checkPlacement(timeline, makeSong(2000), 1)).toBe(true);
  });

  it("returns false for wrong placement (too early)", () => {
    const timeline = [makeSong(2000)];
    expect(checkPlacement(timeline, makeSong(2010), 0)).toBe(false);
  });

  it("returns false for wrong placement (too late)", () => {
    const timeline = [makeSong(2000)];
    expect(checkPlacement(timeline, makeSong(1990), 1)).toBe(false);
  });

  it("allows same year at any position", () => {
    const timeline = [makeSong(2000, "a"), makeSong(2000, "b")];
    expect(checkPlacement(timeline, makeSong(2000, "c"), 0)).toBe(true);
    expect(checkPlacement(timeline, makeSong(2000, "d"), 1)).toBe(true);
    expect(checkPlacement(timeline, makeSong(2000, "e"), 2)).toBe(true);
  });
});

describe("placeSong", () => {
  it("places the card but leaves the score alone until the reveal", () => {
    let room = makeTestRoom();
    const songs = [makeSong(2000), makeSong(1990)];
    room = startGame(room, songs);
    room = { ...room, currentSong: makeSong(2000) };

    const { room: updated, result } = placeSong(room, "host-1", 0);
    expect(result.correct).toBe(true);
    expect(updated.players[0].timeline).toHaveLength(1);
    // The card is TENTATIVE — a wrong one gets undone at reveal, so crediting
    // it here would flash a phantom point on every wrong placement
    expect(updated.players[0].score).toBe(0);
    expect(updated.phase).toBe("bitster-window");
    // The reveal settles the number
    expect(recomputeScores(updated).players[0].score).toBe(1);
  });

  it("tentatively adds song to timeline even on wrong placement", () => {
    let room = makeTestRoom();
    room = startGame(room, [makeSong(2000), makeSong(1990)]);
    room = {
      ...room,
      players: room.players.map((p) =>
        p.id === "host-1" ? { ...p, timeline: [makeSong(2000)] } : p,
      ),
      currentSong: makeSong(1990),
    };

    const { room: updated, result } = placeSong(room, "host-1", 1);
    expect(result.correct).toBe(false);
    // Card is tentatively added (removed during reveal if wrong)
    expect(updated.players[0].timeline).toHaveLength(2);
    expect(updated.phase).toBe("bitster-window");
  });

  it("throws for unknown player", () => {
    let room = makeTestRoom();
    room = { ...room, currentSong: makeSong(2000) };
    expect(() => placeSong(room, "unknown", 0)).toThrow("Player not found");
  });
});

describe("advanceTurn", () => {
  it("cycles to next player", () => {
    const room = makeTestRoom();
    const advanced = advanceTurn(room);
    expect(advanced.currentPlayerIndex).toBe(1);
    expect(advanced.phase).toBe("playing");
    expect(advanced.currentSong).toBeNull();
  });

  it("wraps around to first player", () => {
    let room = makeTestRoom();
    room = { ...room, currentPlayerIndex: 1 };
    const advanced = advanceTurn(room);
    expect(advanced.currentPlayerIndex).toBe(0);
  });
});

describe("pickRandomSong", () => {
  it("picks from unplayed songs", () => {
    let room = makeTestRoom();
    room = { ...room, playlist: [makeSong(2000), makeSong(1990)] };
    const result = pickRandomSong(room);
    expect(result).not.toBeNull();
    expect(result!.song).toBeDefined();
    expect(result!.room.playedSongs).toHaveLength(1);
  });

  it("returns null when all songs played", () => {
    let room = makeTestRoom();
    const song = makeSong(2000);
    room = { ...room, playlist: [song], playedSongs: [song] };
    expect(pickRandomSong(room)).toBeNull();
  });
});

describe("checkWinCondition", () => {
  it("returns null when no winner", () => {
    const room = makeTestRoom();
    expect(checkWinCondition(room)).toBeNull();
  });

  it("returns winning player", () => {
    let room = makeTestRoom();
    room = {
      ...room,
      players: room.players.map((p) =>
        p.id === "host-1" ? { ...p, score: 10 } : p,
      ),
    };
    const winner = checkWinCondition(room);
    expect(winner).not.toBeNull();
    expect(winner!.name).toBe("Alice");
  });
});

describe("startGame", () => {
  it("resets scores and timelines", () => {
    let room = makeTestRoom();
    room = {
      ...room,
      players: room.players.map((p) => ({
        ...p,
        score: 5,
        timeline: [makeSong(2000)],
      })),
    };
    const playlist = [makeSong(2000), makeSong(1990)];
    const started = startGame(room, playlist);
    expect(started.phase).toBe("playing");
    expect(started.playlist).toHaveLength(2);
    expect(started.players[0].score).toBe(0);
    expect(started.players[0].timeline).toHaveLength(0);
    expect(started.playedSongs).toHaveLength(0);
  });
});

describe("getCurrentPlayer", () => {
  it("returns current player", () => {
    const room = makeTestRoom();
    expect(getCurrentPlayer(room)?.name).toBe("Alice");
  });
});

describe("buildGameState", () => {
  it("builds serializable game state", () => {
    const room = makeTestRoom();
    const state = buildGameState(room, TEST_META);
    expect(state.roomCode).toBe("TEST01");
    expect(state.players).toHaveLength(2);
    expect(state.phase).toBe("lobby");
    expect(state.hostId).toBe("host-1");
    expect(state.timelines).toBeDefined();
  });

  it("does not leak the current song via playedSongs while guessing", () => {
    const song = makeSong(1999, "secret");
    let room = makeTestRoom();
    room = {
      ...room,
      phase: "playing",
      currentSong: song,
      playedSongs: [makeSong(1980, "old"), song],
    };
    const state = buildGameState(room, TEST_META);
    expect(state.playedSongs).toHaveLength(1);
    expect(state.playedSongs[0].name).toBe("Song 1980");
  });

  it("masks the current song's year in timelines during bitster-window", () => {
    const song = makeSong(1999, "secret");
    let room = makeTestRoom();
    room = {
      ...room,
      phase: "bitster-window",
      currentSong: song,
      players: room.players.map((p) =>
        p.id === "host-1"
          ? { ...p, timeline: [makeSong(1980, "old"), song] }
          : p,
      ),
    };
    const state = buildGameState(room, TEST_META);
    const years = state.timelines["host-1"].map((s) => s.year);
    expect(years).toEqual([1980, 0]);
    // playedSongs must not contain it either
    expect(state.playedSongs.some((s) => s.name === song.name)).toBe(false);
  });

  it("includes the current song again from reveal on", () => {
    const song = makeSong(1999, "secret");
    let room = makeTestRoom();
    room = {
      ...room,
      phase: "reveal",
      currentSong: song,
      playedSongs: [song],
    };
    const state = buildGameState(room, TEST_META);
    expect(state.playedSongs).toHaveLength(1);
    expect(state.playedSongs[0].year).toBe(1999);
  });
});

describe("undoPlacement", () => {
  it("removes a tentatively placed song from timeline", () => {
    let room = makeTestRoom();
    const song = makeSong(2000);
    room = {
      ...room,
      players: room.players.map((p) =>
        p.id === "host-1"
          ? { ...p, timeline: [song, makeSong(1990)], score: 2 }
          : p,
      ),
    };
    const updated = undoPlacement(room, "host-1", song.id);
    expect(updated.players[0].timeline).toHaveLength(1);
    expect(updated.players[0].score).toBe(1);
  });

  it("does nothing if song not in timeline", () => {
    let room = makeTestRoom();
    room = {
      ...room,
      players: room.players.map((p) =>
        p.id === "host-1" ? { ...p, timeline: [makeSong(2000)], score: 1 } : p,
      ),
    };
    const updated = undoPlacement(room, "host-1", "nonexistent");
    expect(updated.players[0].timeline).toHaveLength(1);
  });
});

describe("handleBuzz", () => {
  function makeBuzzRoom(): Room {
    let room = makeTestRoom();
    room = startGame(room, [makeSong(2000)]);
    // The active player needs a card of their own PLUS the disputed one —
    // a placement into an empty timeline can't be wrong, so it can't be
    // challenged either.
    room = {
      ...room,
      phase: "bitster-window",
      currentSong: makeSong(2000),
      players: room.players.map((p, i) =>
        i === 0 ? { ...p, timeline: [makeSong(1990), makeSong(2000)] } : p,
      ),
    };
    return room;
  }

  it("spends a token and sets the buzzer", () => {
    const room = handleBuzz(makeBuzzRoom(), "peer-2");
    expect(room.buzzerId).toBe("peer-2");
    expect(room.players[1].tokens).toBe(1);
  });

  it("rejects the active player", () => {
    const room = handleBuzz(makeBuzzRoom(), "host-1");
    expect(room.buzzerId).toBeNull();
  });

  it("rejects a buzz against an opening card, which cannot be wrong", () => {
    const base = makeBuzzRoom();
    // Only the disputed card in the timeline = it was placed into an empty one
    const openingCard: Room = {
      ...base,
      players: base.players.map((p, i) =>
        i === 0 ? { ...p, timeline: [makeSong(2000)] } : p,
      ),
    };
    expect(canBeChallenged(openingCard)).toBe(false);
    const room = handleBuzz(openingCard, "peer-2");
    expect(room.buzzerId).toBeNull();
    // ...and it costs nothing
    expect(room.players[1].tokens).toBe(2);
  });

  it("allows a buzz as soon as there is a card to compare against", () => {
    expect(canBeChallenged(makeBuzzRoom())).toBe(true);
  });

  it("rejects a player who already passed", () => {
    let room = makeBuzzRoom();
    room = recordPass(room, "peer-2");
    const buzzed = handleBuzz(room, "peer-2");
    expect(buzzed.buzzerId).toBeNull();
    expect(buzzed.players[1].tokens).toBe(2);
  });

  it("rejects a player without tokens", () => {
    let room = makeBuzzRoom();
    room = {
      ...room,
      players: room.players.map((p) =>
        p.id === "peer-2" ? { ...p, tokens: 0 } : p,
      ),
    };
    expect(handleBuzz(room, "peer-2").buzzerId).toBeNull();
  });
});

describe("resolveBuzz — counter-placement in the active player's timeline", () => {
  /**
   * Active player (host-1) has [1990, 2010] and wrongly placed the mystery
   * song (2000). For the resolution, the disputed card is already removed —
   * the buzzer (peer-2, own timeline [1980]) points at a gap in [1990, 2010].
   */
  function makeChallengeRoom(): Room {
    let room = makeTestRoom();
    room = startGame(room, [makeSong(2000)]);
    room = {
      ...room,
      phase: "bitster-window",
      currentSong: makeSong(2000, "mystery"),
      buzzerId: "peer-2",
      players: room.players.map((p) => {
        if (p.id === "host-1")
          return { ...p, timeline: [makeSong(1990), makeSong(2010)] };
        return { ...p, timeline: [makeSong(1980)], tokens: 1 };
      }),
    };
    return room;
  }

  it("checks the position against the ACTIVE player's timeline", () => {
    const { result } = resolveBuzz(makeChallengeRoom(), 1); // between 1990 and 2010
    expect(result.correct).toBe(true);
  });

  it("gives the card to the buzzer at the chronologically correct spot", () => {
    const { room } = resolveBuzz(makeChallengeRoom(), 1);
    const buzzer = room.players.find((p) => p.id === "peer-2")!;
    expect(buzzer.timeline.map((s) => s.year)).toEqual([1980, 2000]);
    expect(buzzer.score).toBe(2);
    expect(room.buzzerId).toBeNull();
    expect(room.phase).toBe("reveal");
  });

  it("awards nothing for a wrong gap", () => {
    const { room, result } = resolveBuzz(makeChallengeRoom(), 0); // before 1990
    expect(result.correct).toBe(false);
    const buzzer = room.players.find((p) => p.id === "peer-2")!;
    expect(buzzer.timeline).toHaveLength(1);
  });

  it("applies the lose-point penalty when configured", () => {
    let room = makeChallengeRoom();
    room = {
      ...room,
      settings: {
        ...room.settings,
        rules: {
          buzz: { enabled: true, penalty: "lose-point", timerSeconds: 30 },
          placement: { timerSeconds: null },
          skip: DEFAULT_RULES.skip,
          guess: DEFAULT_RULES.guess,
          tokens: DEFAULT_RULES.tokens,
        },
      },
      players: room.players.map((p) =>
        p.id === "peer-2" ? { ...p, score: 1 } : p,
      ),
    };
    const { room: resolved } = resolveBuzz(room, 0);
    const buzzer = resolved.players.find((p) => p.id === "peer-2")!;
    expect(buzzer.score).toBe(0);
    expect(buzzer.penalties).toBe(1);
  });

  it("keeps the penalty durable across later placements", () => {
    let room = makeChallengeRoom();
    room = {
      ...room,
      settings: {
        ...room.settings,
        rules: {
          buzz: { enabled: true, penalty: "lose-point", timerSeconds: 30 },
          placement: { timerSeconds: null },
          skip: DEFAULT_RULES.skip,
          guess: DEFAULT_RULES.guess,
          tokens: DEFAULT_RULES.tokens,
        },
      },
    };
    const { room: resolved } = resolveBuzz(room, 0);
    // Buzzer (1 card, 1 penalty) later places a correct card: the score must
    // reflect the penalty (2 cards - 1 penalty = 1), not plain length.
    let next = advanceTurn(resolved);
    next = { ...next, currentSong: makeSong(2005, "later-song") };
    // Make peer-2 the acting player for the placement
    const buzzerIndex = next.players.findIndex((p) => p.id === "peer-2");
    next = { ...next, currentPlayerIndex: buzzerIndex };
    const { room: placed } = placeSong(next, "peer-2", 1);
    // Scores settle at the reveal, so run the settle step before asserting
    const buzzer = recomputeScores(placed).players.find(
      (p) => p.id === "peer-2",
    )!;
    expect(buzzer.timeline).toHaveLength(2);
    expect(buzzer.score).toBe(1);
  });

  it("throws for a position outside the active player's timeline", () => {
    expect(() => resolveBuzz(makeChallengeRoom(), 5)).toThrow(
      "Invalid position",
    );
  });
});

describe("recordPass / allChallengersPassed", () => {
  function makeWindowRoom(): Room {
    let room = makeTestRoom();
    room = addPlayer(room, "peer-3", "Carol");
    room = startGame(room, [makeSong(2000)]);
    return { ...room, phase: "bitster-window", currentSong: makeSong(2000) };
  }

  it("records a pass from a non-active player", () => {
    const room = recordPass(makeWindowRoom(), "peer-2");
    expect(room.passedIds).toEqual(["peer-2"]);
  });

  it("ignores the active player and duplicates", () => {
    let room = recordPass(makeWindowRoom(), "host-1");
    expect(room.passedIds).toEqual([]);
    room = recordPass(room, "peer-2");
    room = recordPass(room, "peer-2");
    expect(room.passedIds).toEqual(["peer-2"]);
  });

  it("is complete only when every token-holding challenger passed", () => {
    let room = makeWindowRoom();
    expect(allChallengersPassed(room)).toBe(false); // nobody passed yet
    room = recordPass(room, "peer-2");
    expect(allChallengersPassed(room)).toBe(false); // Carol still thinking
    room = recordPass(room, "peer-3");
    expect(allChallengersPassed(room)).toBe(true);
  });

  it("skips broke players when counting", () => {
    let room = makeWindowRoom();
    room = {
      ...room,
      players: room.players.map((p) =>
        p.id === "peer-3" ? { ...p, tokens: 0 } : p,
      ),
    };
    room = recordPass(room, "peer-2");
    expect(allChallengersPassed(room)).toBe(true);
  });

  it("is never complete while a buzz is running", () => {
    let room = makeWindowRoom();
    room = recordPass(room, "peer-2");
    room = recordPass(room, "peer-3");
    room = { ...room, buzzerId: "peer-2" };
    expect(allChallengersPassed(room)).toBe(false);
  });

  it("clears passes on the next turn", () => {
    let room = recordPass(makeWindowRoom(), "peer-2");
    expect(advanceTurn(room).passedIds).toEqual([]);
  });
});

describe("evaluateGuess — fuzzy matching", () => {
  function makeRoomWithSong(name: string, artist: string): Room {
    let room = makeTestRoom();
    room = startGame(room, []);
    room = {
      ...room,
      currentSong: { id: "test", uri: "test:1", name, artist, year: 2000 },
    };
    return room;
  }

  it("is worth 1 token when both title and artist are correct", () => {
    const room = makeRoomWithSong("Blinding Lights", "The Weeknd");
    const result = evaluateGuess(room, "Blinding Lights", "The Weeknd");
    expect(result.titleCorrect).toBe(true);
    expect(result.artistCorrect).toBe(true);
    expect(result.yearCorrect).toBeNull(); // no year guessed
    expect(guessReward(result, DEFAULT_RULES.guess)).toBe(1);
    // Evaluation is pure — tokens move only via awardTokens (at reveal)
    expect(room.players[0].tokens).toBe(2);
    const rewarded = awardTokens(room, "host-1", guessReward(result, DEFAULT_RULES.guess));
    expect(rewarded.players[0].tokens).toBe(3);
    expect(rewarded.players[0].stats.guessTokens).toBe(1);
  });

  it("is worth 0 tokens when only the title is correct", () => {
    const room = makeRoomWithSong("Blinding Lights", "The Weeknd");
    const result = evaluateGuess(room, "Blinding Lights", "Drake");
    expect(result.titleCorrect).toBe(true);
    expect(result.artistCorrect).toBe(false);
    expect(guessReward(result, DEFAULT_RULES.guess)).toBe(0);
  });

  it("pays an extra token for the exact year", () => {
    const room = makeRoomWithSong("Blinding Lights", "The Weeknd");
    const result = evaluateGuess(room, "Blinding Lights", "The Weeknd", 2000);
    expect(result.yearCorrect).toBe(true);
    expect(guessReward(result, DEFAULT_RULES.guess)).toBe(2);
    // Wrong year: no extra token, everything else unaffected
    const wrongYear = evaluateGuess(room, "Blinding Lights", "The Weeknd", 1999);
    expect(wrongYear.yearCorrect).toBe(false);
    expect(guessReward(wrongYear, DEFAULT_RULES.guess)).toBe(1);
    // Year-only sniping works too
    const yearOnly = evaluateGuess(room, "", "", 2000);
    expect(guessReward(yearOnly, DEFAULT_RULES.guess)).toBe(1);
  });

  it("matches single artist from multi-artist credit", () => {
    const room = makeRoomWithSong("Song", "Drake, Future, Young Thug");
    expect(evaluateGuess(room, "Song", "Drake").artistCorrect).toBe(
      true,
    );
    expect(evaluateGuess(room, "Song", "Future").artistCorrect).toBe(
      true,
    );
    expect(
      evaluateGuess(room, "Song", "Young Thug").artistCorrect,
    ).toBe(true);
  });

  it("matches artist from feat. credit", () => {
    const room = makeRoomWithSong("Song", "Eminem feat. Rihanna");
    expect(evaluateGuess(room, "Song", "Eminem").artistCorrect).toBe(
      true,
    );
    expect(evaluateGuess(room, "Song", "Rihanna").artistCorrect).toBe(
      true,
    );
  });

  it("matches space-separated multi-artist guess", () => {
    const room = makeRoomWithSong("Song", "Eminem ft. Rihanna");
    // "Eminem Rihanna" normalizes to "eminemrihanna" which contains "eminem"
    expect(
      evaluateGuess(room, "Song", "Eminem Rihanna").artistCorrect,
    ).toBe(true);
  });

  it("matches slash-separated multi-artist guess", () => {
    const room = makeRoomWithSong("Song", "Eminem ft. Rihanna");
    expect(
      evaluateGuess(room, "Song", "eminem/rihanna").artistCorrect,
    ).toBe(true);
  });

  it("is case insensitive", () => {
    const room = makeRoomWithSong("Blinding Lights", "The Weeknd");
    const result = evaluateGuess(room, "blinding lights", "the weeknd");
    expect(result.titleCorrect).toBe(true);
    expect(result.artistCorrect).toBe(true);
  });

  it("forgives small typos in longer titles", () => {
    const room = makeRoomWithSong("Bohemian Rhapsody", "Queen");
    expect(
      evaluateGuess(room, "Bohemian Rapsody", "Queen").titleCorrect,
    ).toBe(true);
    expect(
      evaluateGuess(room, "Bohemien Rapsody", "Queen").titleCorrect,
    ).toBe(true);
  });

  it("forgives transposed letters", () => {
    const room = makeRoomWithSong("Blinding Lights", "The Weeknd");
    expect(
      evaluateGuess(room, "Blidning Lights", "Teh Weeknd")
        .titleCorrect,
    ).toBe(true);
    expect(
      evaluateGuess(room, "Blidning Lights", "Teh Weeknd")
        .artistCorrect,
    ).toBe(true);
  });

  it("forgives typos in artist names", () => {
    const room = makeRoomWithSong("Song", "Nirvana");
    expect(evaluateGuess(room, "Song", "Nirvna").artistCorrect).toBe(
      true,
    );
    expect(
      evaluateGuess(room, "Song", "Nirvanna").artistCorrect,
    ).toBe(true);
  });

  it("keeps short titles strict — no tolerance under 5 characters", () => {
    const room = makeRoomWithSong("Yo", "Artist Somebody");
    expect(
      evaluateGuess(room, "No", "Artist Somebody").titleCorrect,
    ).toBe(false);
  });

  it("does not match a genuinely different title", () => {
    const room = makeRoomWithSong("Hello", "Adele");
    expect(evaluateGuess(room, "Hollow", "Adele").titleCorrect).toBe(
      false,
    );
    expect(
      evaluateGuess(room, "Wonderwall", "Adele").titleCorrect,
    ).toBe(false);
  });

  it("does not stretch tolerance across large length differences", () => {
    const room = makeRoomWithSong("Smells Like Teen Spirit", "Nirvana");
    expect(
      evaluateGuess(room, "Smells", "Nirvana").titleCorrect,
    ).toBe(false);
    expect(
      evaluateGuess(room, "Smels Like Teen Spirit", "Nirvana")
        .titleCorrect,
    ).toBe(true);
  });

  it("strips remix suffix from title", () => {
    const room = makeRoomWithSong("Blinding Lights (Remix)", "The Weeknd");
    expect(
      evaluateGuess(room, "Blinding Lights", "The Weeknd")
        .titleCorrect,
    ).toBe(true);
  });

  it("strips feat. from title", () => {
    const room = makeRoomWithSong("HUMBLE. (feat. Someone)", "Kendrick Lamar");
    expect(
      evaluateGuess(room, "HUMBLE", "Kendrick Lamar").titleCorrect,
    ).toBe(true);
  });

  it("strips dash-suffix from title", () => {
    const room = makeRoomWithSong("Song - Remastered 2021", "Artist");
    expect(evaluateGuess(room, "Song", "Artist").titleCorrect).toBe(
      true,
    );
  });

  it("handles ß vs ss", () => {
    const room = makeRoomWithSong("Straße", "Artist");
    expect(
      evaluateGuess(room, "Strasse", "Artist").titleCorrect,
    ).toBe(true);
  });

  it("handles diacritics", () => {
    const room = makeRoomWithSong("Déjà Vu", "Artist");
    expect(
      evaluateGuess(room, "Deja Vu", "Artist").titleCorrect,
    ).toBe(true);
  });

  it("rejects empty guess", () => {
    const room = makeRoomWithSong("Song", "Artist");
    expect(evaluateGuess(room, "", "").titleCorrect).toBe(false);
    expect(evaluateGuess(room, "", "").artistCorrect).toBe(false);
  });
});

describe("round log", () => {
  const BASE = {
    song: makeSong(1985),
    activePlayerId: "host-1",
    activePlayerName: "Alice",
    outcome: "placed" as const,
    position: 0,
    correct: true,
    placeMs: 1200,
    guess: null,
    buzz: null,
    tokens: [],
    rerolls: [],
    passes: [],
  };

  it("stamps sequential round numbers regardless of the caller", () => {
    let room = makeTestRoom();
    room = appendRound(room, BASE);
    room = appendRound(room, BASE);
    room = appendRound(room, BASE);
    expect(room.rounds.map((r) => r.round)).toEqual([1, 2, 3]);
  });

  it("stops appending at the hard limit", () => {
    let room = makeTestRoom();
    for (let i = 0; i < MAX_ROUNDS_PER_GAME + 5; i++) {
      room = appendRound(room, BASE);
    }
    expect(room.rounds).toHaveLength(MAX_ROUNDS_PER_GAME);
  });

  it("caps the event arrays and the names inside them", () => {
    let room = makeTestRoom();
    room = appendRound(room, {
      ...BASE,
      tokens: Array.from({ length: MAX_ROUND_ENTRIES + 4 }, () => ({
        playerId: "host-1",
        playerName: "A".repeat(60),
        delta: -1 as const,
        reason: "buzz" as const,
      })),
      rerolls: Array.from({ length: MAX_ROUND_ENTRIES + 4 }, (_, i) => ({
        index: i,
        reason: "unplayable" as const,
      })),
      passes: [{ playerId: "peer-2", playerName: "B".repeat(60) }],
    });

    const round = room.rounds[0];
    expect(round.tokens).toHaveLength(MAX_ROUND_ENTRIES);
    expect(round.rerolls).toHaveLength(MAX_ROUND_ENTRIES);
    expect(round.tokens[0].playerName.length).toBeLessThanOrEqual(24);
    expect(round.passes[0].playerName.length).toBeLessThanOrEqual(24);
  });

  it("caps guess text and rejects a nonsensical duration", () => {
    let room = makeTestRoom();
    room = appendRound(room, {
      ...BASE,
      placeMs: -5,
      guess: {
        title: "x".repeat(200),
        artist: "  Artist  ",
        year: 1985,
        titleCorrect: false,
        artistCorrect: true,
        yearCorrect: true,
        tokens: 1,
      },
    });
    expect(room.rounds[0].guess?.title.length).toBe(MAX_GUESS_TEXT);
    expect(room.rounds[0].guess?.artist).toBe("Artist");
    expect(room.rounds[0].placeMs).toBeNull();
  });

  it("starts a new game with an empty log", () => {
    let room = makeTestRoom();
    room = appendRound(room, BASE);
    room = startGame(room, [makeSong(1990)], "Playlist");
    expect(room.rounds).toEqual([]);
  });
});

describe("buildGameRecap", () => {
  const OPTS = {
    startedAt: 1,
    endedAt: 2,
    endedReason: "win" as const,
    demo: false,
  };

  it("names the winner for a win", () => {
    let room = makeTestRoom();
    room = { ...room, settings: { ...room.settings, winScore: 1 } };
    room = {
      ...room,
      players: room.players.map((p) =>
        p.id === "peer-2" ? { ...p, score: 1 } : p,
      ),
    };
    expect(buildGameRecap(room, OPTS).winnerId).toBe("peer-2");
  });

  it("names nobody for an abandoned game, even with a player at the win score", () => {
    let room = makeTestRoom();
    room = { ...room, settings: { ...room.settings, winScore: 1 } };
    room = {
      ...room,
      players: room.players.map((p) =>
        p.id === "peer-2" ? { ...p, score: 5 } : p,
      ),
    };
    const recap = buildGameRecap(room, { ...OPTS, endedReason: "abandoned" });
    expect(recap.winnerId).toBeNull();
    expect(recap.endedReason).toBe("abandoned");
  });

  it("gives an exhausted playlist to the sole top scorer, nobody on a tie", () => {
    let room = makeTestRoom();
    room = {
      ...room,
      players: room.players.map((p) => ({ ...p, score: 3 })),
    };
    expect(
      buildGameRecap(room, { ...OPTS, endedReason: "playlist-exhausted" })
        .winnerId,
    ).toBeNull();

    room = {
      ...room,
      players: room.players.map((p) =>
        p.id === "host-1" ? { ...p, score: 4 } : p,
      ),
    };
    expect(
      buildGameRecap(room, { ...OPTS, endedReason: "playlist-exhausted" })
        .winnerId,
    ).toBe("host-1");
  });

  it("never carries timelines or failed piles into the recap", () => {
    let room = makeTestRoom();
    room = { ...room, currentSong: makeSong(1985) };
    const { room: placed } = placeSong(room, "host-1", 0);
    const recap = buildGameRecap(placed, OPTS);
    for (const player of recap.players) {
      expect(player).not.toHaveProperty("timeline");
      expect(player).not.toHaveProperty("failedSongs");
    }
    expect(recap.players[0].timelineLength).toBe(1);
  });
});

describe("connection state", () => {
  it("starts every player connected", () => {
    const room = makeTestRoom();
    expect(room.players.every((p) => p.connected)).toBe(true);
    expect(room.players.every((p) => p.disconnectedUntil === null)).toBe(true);
  });

  it("clears the grace when the same id returns", () => {
    let room = makeTestRoom();
    room = setPlayerConnected(room, "peer-2", false, 1_700_000_060_000);
    expect(room.players[1].connected).toBe(false);

    room = addPlayer(room, "peer-2", "Bob");
    expect(room.players[1].connected).toBe(true);
    expect(room.players[1].disconnectedUntil).toBeNull();
  });

  it("ignores local players and unknown ids", () => {
    let room = makeTestRoom();
    room = addPlayer(room, "local-1", "Karl", true);
    const withLocal = setPlayerConnected(room, "local-1", false, 1_000);
    expect(withLocal.players.find((p) => p.id === "local-1")?.connected).toBe(
      true,
    );
    expect(setPlayerConnected(room, "nobody", false, 1_000)).toBe(room);
  });

  it("does not wait for a pass from a disconnected challenger", () => {
    let room = makeTestRoom();
    room = addPlayer(room, "peer-3", "Cleo");
    room = { ...room, phase: "bitster-window" };
    room = recordPass(room, "peer-2");
    // Cleo has not passed yet, so the window is still open
    expect(allChallengersPassed(room)).toBe(false);

    room = setPlayerConnected(room, "peer-3", false, 1_700_000_060_000);
    expect(allChallengersPassed(room)).toBe(true);
  });

  it("reports no live challengers when everyone else is offline or broke", () => {
    let room = makeTestRoom();
    expect(hasLiveChallengers(room)).toBe(true);

    room = setPlayerConnected(room, "peer-2", false, 1_700_000_060_000);
    expect(hasLiveChallengers(room)).toBe(false);

    room = setPlayerConnected(room, "peer-2", true, null);
    room = {
      ...room,
      players: room.players.map((p) =>
        p.id === "peer-2" ? { ...p, tokens: 0 } : p,
      ),
    };
    expect(hasLiveChallengers(room)).toBe(false);
  });

  it("carries the connection state into the broadcast", () => {
    let room = makeTestRoom();
    room = setPlayerConnected(room, "peer-2", false, 1_700_000_060_000);
    const state = buildGameState(room, TEST_META);
    const bob = state.players.find((p) => p.id === "peer-2");
    expect(bob?.connected).toBe(false);
    expect(bob?.disconnectedUntil).toBe(1_700_000_060_000);
  });

  it("never puts the round log into the broadcast", () => {
    const room = makeTestRoom();
    const withRounds: Room = {
      ...room,
      rounds: [
        {
          round: 1,
          song: makeSong(1975),
          activePlayerId: "host-1",
          activePlayerName: "Alice",
          outcome: "placed",
          position: 0,
          correct: true,
          placeMs: 1200,
          guess: null,
          buzz: null,
          tokens: [],
          rerolls: [],
          passes: [],
        },
      ],
    };
    const state = buildGameState(withRounds, TEST_META);
    expect("rounds" in (state as object)).toBe(false);
  });
});

describe("difficulty rules", () => {
  function roomWithRules(over: Partial<Room["settings"]["rules"]>): Room {
    let room = makeTestRoom();
    room = {
      ...room,
      settings: {
        ...room.settings,
        rules: { ...room.settings.rules, ...over },
      },
    };
    room = startGame(room, []);
    return {
      ...room,
      currentSong: {
        id: "test",
        uri: "test:1",
        name: "Blinding Lights",
        artist: "The Weeknd",
        year: 2000,
      },
    };
  }

  it("pays for half a guess on 'either', but not on 'both'", () => {
    const easy = roomWithRules({
      guess: { require: "either", yearBonus: true, yearTolerance: 0 },
    });
    const halfRight = evaluateGuess(easy, "Blinding Lights", "Drake");
    expect(guessReward(halfRight, easy.settings.rules.guess)).toBe(1);
    expect(guessReward(halfRight, DEFAULT_RULES.guess)).toBe(0);
  });

  it("honours title-only and artist-only difficulties", () => {
    const titleOnly = roomWithRules({
      guess: { require: "title", yearBonus: false, yearTolerance: 0 },
    });
    const result = evaluateGuess(titleOnly, "Blinding Lights", "Nobody");
    expect(guessReward(result, titleOnly.settings.rules.guess)).toBe(1);

    const artistOnly = roomWithRules({
      guess: { require: "artist", yearBonus: false, yearTolerance: 0 },
    });
    const other = evaluateGuess(artistOnly, "Wrong", "The Weeknd");
    expect(guessReward(other, artistOnly.settings.rules.guess)).toBe(1);
  });

  it("lets the year be off by the configured tolerance", () => {
    const lenient = roomWithRules({
      guess: { require: "both", yearBonus: true, yearTolerance: 2 },
    });
    expect(evaluateGuess(lenient, "", "", 2002).yearCorrect).toBe(true);
    expect(evaluateGuess(lenient, "", "", 1998).yearCorrect).toBe(true);
    expect(evaluateGuess(lenient, "", "", 2003).yearCorrect).toBe(false);
  });

  it("pays nothing for the year when the bonus is switched off", () => {
    const noBonus = roomWithRules({
      guess: { require: "both", yearBonus: false, yearTolerance: 0 },
    });
    const result = evaluateGuess(noBonus, "Blinding Lights", "The Weeknd", 2000);
    // The verdict still says "right" — only the payout is gone
    expect(result.yearCorrect).toBe(true);
    expect(guessReward(result, noBonus.settings.rules.guess)).toBe(1);
  });

  it("charges the configured reroll cost, and nothing when it is free", () => {
    const free = roomWithRules({ skip: { enabled: true, cost: 0 } });
    expect(skipSong(free, "host-1").players[0].tokens).toBe(
      free.players[0].tokens,
    );

    const pricey = roomWithRules({ skip: { enabled: true, cost: 2 } });
    expect(skipSong(pricey, "host-1").players[0].tokens).toBe(
      pricey.players[0].tokens - 2,
    );
  });

  it("refuses a reroll nobody can pay for", () => {
    const pricey = roomWithRules({ skip: { enabled: true, cost: 2 } });
    const broke: Room = {
      ...pricey,
      players: pricey.players.map((p) => ({ ...p, tokens: 1 })),
    };
    expect(() => skipSong(broke, "host-1")).toThrow("No tokens");
  });

  it("hands out the configured starting tokens at kickoff", () => {
    let room = makeTestRoom();
    room = {
      ...room,
      settings: {
        ...room.settings,
        rules: { ...room.settings.rules, tokens: { start: 4 } },
      },
    };
    // Set at start, not at join — the host may still be picking a mode
    expect(room.players.every((p) => p.tokens === 2)).toBe(true);
    const started = startGame(room, []);
    expect(started.players.every((p) => p.tokens === 4)).toBe(true);
  });
});
