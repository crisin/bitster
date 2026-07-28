import {
  addPlayer,
  appendRound,
  buildGameRecap,
  buildGameState,
  createRoom,
} from "@/game/logic";
import type { GameRecap, GameState, GameStateMeta } from "@/game/types";
import {
  DEFAULT_RULES,
  MAX_ROUND_ENTRIES,
  MAX_ROUNDS_PER_GAME,
} from "@/game/types";
import { describe, expect, it } from "vitest";
import {
  parseRoundRecord,
  validateAction,
  validateGameRecap,
  validateGameState,
} from "./protocol";

/** Fixed stamp so states stay comparable across runs */
const TEST_META: GameStateMeta = {
  hostNow: 1_700_000_000_000,
  stateVersion: 7,
};

function makeValidState(): GameState {
  let room = createRoom("TEST01", "host-1", "Alice");
  room = addPlayer(room, "peer-2", "Bob");
  return buildGameState(room, TEST_META);
}

describe("validateAction", () => {
  it("accepts a valid join", () => {
    const action = validateAction({ type: "join", payload: { name: "Alice" } });
    expect(action).toEqual({ type: "join", payload: { name: "Alice" } });
  });

  it("rejects join with empty name", () => {
    expect(validateAction({ type: "join", payload: { name: "" } })).toBeNull();
  });

  it("rejects unknown action types", () => {
    expect(validateAction({ type: "hack-the-game", payload: {} })).toBeNull();
    expect(
      validateAction({ type: "kick-player", payload: { playerId: "x" } }),
    ).toBeNull();
  });

  it("rejects non-object data", () => {
    expect(validateAction(null)).toBeNull();
    expect(validateAction("join")).toBeNull();
    expect(validateAction(42)).toBeNull();
  });

  it("rejects place-song with negative or non-integer position", () => {
    expect(
      validateAction({ type: "place-song", payload: { position: -1 } }),
    ).toBeNull();
    expect(
      validateAction({ type: "place-song", payload: { position: 1.5 } }),
    ).toBeNull();
    expect(
      validateAction({ type: "place-song", payload: { position: 2 } }),
    ).not.toBeNull();
  });

  it("accepts a valid game-state payload", () => {
    const action = validateAction({
      type: "game-state",
      payload: makeValidState(),
    });
    expect(action?.type).toBe("game-state");
  });

  it("validates the buzz actions", () => {
    expect(validateAction({ type: "bitster-pass" })).toEqual({
      type: "bitster-pass",
    });
    expect(
      validateAction({ type: "buzz-select", payload: { position: 2 } }),
    ).toEqual({
      type: "buzz-select",
      payload: { position: 2 },
    });
    expect(
      validateAction({ type: "buzz-select", payload: { position: -1 } }),
    ).toBeNull();
  });

  it("validates the local-player actions", () => {
    expect(
      validateAction({ type: "add-local-player", payload: { name: "Karl" } }),
    ).toEqual({ type: "add-local-player", payload: { name: "Karl" } });
    expect(
      validateAction({ type: "add-local-player", payload: { name: "" } }),
    ).toBeNull();
    expect(
      validateAction({
        type: "remove-local-player",
        payload: { playerId: "local-1" },
      }),
    ).toEqual({
      type: "remove-local-player",
      payload: { playerId: "local-1" },
    });
    expect(
      validateAction({ type: "remove-local-player", payload: {} }),
    ).toBeNull();
  });

  it("validates set-playlist", () => {
    expect(
      validateAction({
        type: "set-playlist",
        payload: { playlistUrl: "https://x" },
      }),
    ).toEqual({ type: "set-playlist", payload: { playlistUrl: "https://x" } });
    expect(validateAction({ type: "set-playlist", payload: {} })).toBeNull();
  });

  it("defaults a missing buzz timer to 30 seconds", () => {
    const action = validateAction({
      type: "update-settings",
      payload: { rules: { buzz: { enabled: true, penalty: "none" } } },
    });
    expect(action).toEqual({
      type: "update-settings",
      payload: {
        rules: {
          buzz: { enabled: true, penalty: "none", timerSeconds: 30 },
          // Placement rules default to "off" for senders that don't know them
          placement: { timerSeconds: null },
          // Everything a sender leaves out falls back to the defaults, so an
          // older client can still change one rule without wiping the rest
          skip: DEFAULT_RULES.skip,
          guess: DEFAULT_RULES.guess,
          tokens: DEFAULT_RULES.tokens,
        },
      },
    });
  });

  it("validates update-settings structurally", () => {
    expect(
      validateAction({ type: "update-settings", payload: { winScore: 5 } }),
    ).toEqual({ type: "update-settings", payload: { winScore: 5 } });
    expect(
      validateAction({
        type: "update-settings",
        payload: { winScore: "lots" },
      }),
    ).toBeNull();
    expect(
      validateAction({
        type: "update-settings",
        payload: { rules: { buzz: { enabled: true, penalty: "cheat" } } },
      }),
    ).toBeNull();
  });
});

describe("validateGameState", () => {
  it("round-trips a real host state", () => {
    const state = makeValidState();
    expect(validateGameState(state)).toEqual(state);
  });

  it("survives JSON serialization (the actual wire format)", () => {
    const state = makeValidState();
    expect(validateGameState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it("rejects an invalid phase", () => {
    const state = { ...makeValidState(), phase: "cheating" };
    expect(validateGameState(state)).toBeNull();
  });

  it("rejects a missing hostId", () => {
    const state: Record<string, unknown> = { ...makeValidState() };
    delete state.hostId;
    expect(validateGameState(state)).toBeNull();
  });

  it("rejects malformed players", () => {
    const state = {
      ...makeValidState(),
      players: [
        { id: "p1", name: "Eve", score: "9999", timelineLength: 0, tokens: 2 },
      ],
    };
    expect(validateGameState(state)).toBeNull();
  });

  it("rejects a timeline containing a malformed song", () => {
    const state = {
      ...makeValidState(),
      timelines: { "host-1": [{ id: "s1", uri: "u", name: "x" }] },
    };
    expect(validateGameState(state)).toBeNull();
  });

  it("accepts masked years (year 0) in timelines", () => {
    const state = makeValidState();
    state.timelines["host-1"] = [
      {
        id: "s1",
        uri: "spotify:track:1",
        name: "Song",
        artist: "Artist",
        year: 0,
      },
    ];
    expect(validateGameState(state)).not.toBeNull();
  });

  it("strips unknown extra fields", () => {
    const dirty = { ...makeValidState(), evil: "payload" };
    const clean = validateGameState(dirty);
    expect(clean).not.toBeNull();
    expect("evil" in (clean as object)).toBe(false);
  });
});

describe("validateGameRecap", () => {
  function makeRecap(): GameRecap {
    let room = createRoom("TEST01", "host-1", "Alice");
    room = addPlayer(room, "peer-2", "Bob");
    room = appendRound(room, {
      song: {
        id: "s1",
        uri: "spotify:track:1",
        name: "Song",
        artist: "Artist",
        year: 1985,
      },
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
    });
    return buildGameRecap(room, {
      startedAt: 1,
      endedAt: 2,
      endedReason: "win",
      demo: false,
    });
  }

  it("accepts what buildGameRecap produces", () => {
    const recap = validateGameRecap(JSON.parse(JSON.stringify(makeRecap())));
    expect(recap).not.toBeNull();
    expect(recap?.rounds[0].song.year).toBe(1985);
  });

  it("round-trips through validateAction", () => {
    const action = validateAction({
      type: "game-recap",
      payload: JSON.parse(JSON.stringify(makeRecap())),
    });
    expect(action?.type).toBe("game-recap");
    expect(validateAction({ type: "game-recap", payload: { junk: 1 } })).toBeNull();
  });

  it("tolerates a missing demo flag and version", () => {
    const { demo, version, ...rest } = makeRecap();
    void demo;
    void version;
    const recap = validateGameRecap(rest);
    expect(recap?.demo).toBe(false);
    expect(recap?.version).toBe(1);
  });

  it("rejects an unknown outcome or end reason", () => {
    const bad = makeRecap();
    expect(
      validateGameRecap({ ...bad, endedReason: "vibes" }),
    ).toBeNull();
    expect(
      validateGameRecap({
        ...bad,
        rounds: [{ ...bad.rounds[0], outcome: "vanished" }],
      }),
    ).toBeNull();
  });

  it("rejects an unbounded rounds or players array", () => {
    const bad = makeRecap();
    expect(
      validateGameRecap({
        ...bad,
        rounds: Array.from({ length: MAX_ROUNDS_PER_GAME + 1 }, () => bad.rounds[0]),
      }),
    ).toBeNull();
    expect(
      validateGameRecap({
        ...bad,
        players: Array.from({ length: 33 }, () => bad.players[0]),
      }),
    ).toBeNull();
  });

  it("rejects a round with a malformed song or a negative number", () => {
    const bad = makeRecap();
    expect(
      validateGameRecap({
        ...bad,
        rounds: [{ ...bad.rounds[0], song: { id: "x" } }],
      }),
    ).toBeNull();
    expect(
      validateGameRecap({
        ...bad,
        rounds: [{ ...bad.rounds[0], placeMs: -1 }],
      }),
    ).toBeNull();
    expect(validateGameRecap({ ...bad, startedAt: -1 })).toBeNull();
  });
});

describe("validateGameState — host clock and version", () => {
  it("tolerates an older host that sends neither field", () => {
    const { hostNow, stateVersion, ...rest } = makeValidState();
    void hostNow;
    void stateVersion;
    const clean = validateGameState(rest);
    expect(clean?.hostNow).toBeNull();
    expect(clean?.stateVersion).toBeNull();
  });

  it("accepts explicit nulls", () => {
    const state = { ...makeValidState(), hostNow: null, stateVersion: null };
    const clean = validateGameState(state);
    expect(clean).not.toBeNull();
    expect(clean?.hostNow).toBeNull();
  });

  it("round-trips both values through JSON unchanged", () => {
    const state = makeValidState();
    const clean = validateGameState(JSON.parse(JSON.stringify(state)));
    expect(clean?.hostNow).toBe(TEST_META.hostNow);
    expect(clean?.stateVersion).toBe(TEST_META.stateVersion);
  });

  it("accepts a hostNow far in the future (no magnitude clamp)", () => {
    const state = { ...makeValidState(), hostNow: 7_258_118_400_000 };
    expect(validateGameState(state)).not.toBeNull();
  });

  it.each([1.5, "now", NaN, Infinity, 0, -1, true])(
    "rejects a malformed hostNow: %s",
    (bad) => {
      const state = { ...makeValidState(), hostNow: bad };
      expect(validateGameState(state)).toBeNull();
    },
  );

  it.each([-1, 1.5, "seven", NaN])(
    "rejects a malformed stateVersion: %s",
    (bad) => {
      const state = { ...makeValidState(), stateVersion: bad };
      expect(validateGameState(state)).toBeNull();
    },
  );
});

describe("validateGameState — connection flags", () => {
  it("defaults connected to true for an older host", () => {
    const state = makeValidState();
    const players = state.players.map(({ connected, ...p }) => {
      void connected;
      return p;
    });
    const clean = validateGameState({ ...state, players });
    expect(clean?.players.every((p) => p.connected)).toBe(true);
    expect(clean?.players.every((p) => p.disconnectedUntil === null)).toBe(true);
  });

  it("carries a disconnected player through", () => {
    const state = makeValidState();
    state.players[1] = {
      ...state.players[1],
      connected: false,
      disconnectedUntil: 1_700_000_060_000,
    };
    const clean = validateGameState(state);
    expect(clean?.players[1].connected).toBe(false);
    expect(clean?.players[1].disconnectedUntil).toBe(1_700_000_060_000);
  });

  it.each(["true", 0, {}])("rejects a non-boolean connected: %s", (bad) => {
    const state = makeValidState();
    const players = state.players.map((p, i) =>
      i === 0 ? { ...p, connected: bad } : p,
    );
    expect(validateGameState({ ...state, players })).toBeNull();
  });

  it.each(["soon", NaN, Infinity, 1.5])(
    "rejects a malformed disconnectedUntil: %s",
    (bad) => {
      const state = makeValidState();
      const players = state.players.map((p, i) =>
        i === 0 ? { ...p, disconnectedUntil: bad } : p,
      );
      expect(validateGameState({ ...state, players })).toBeNull();
    },
  );
});

describe("round-log events on the wire", () => {
  function roundWithEvents(over: Record<string, unknown> = {}) {
    return {
      round: 1,
      song: {
        id: "s1",
        uri: "spotify:track:1",
        name: "Song",
        artist: "Artist",
        year: 1985,
      },
      activePlayerId: "host-1",
      activePlayerName: "Alice",
      outcome: "placed",
      position: 0,
      correct: true,
      placeMs: 1200,
      guess: null,
      buzz: null,
      tokens: [
        { playerId: "peer-2", playerName: "Bob", delta: -1, reason: "buzz" },
      ],
      rerolls: [{ index: 7, reason: "unplayable" }],
      passes: [{ playerId: "peer-3", playerName: "Cleo" }],
      ...over,
    };
  }

  it("keeps tokens, rerolls and passes intact", () => {
    const parsed = parseRoundRecord(roundWithEvents());
    expect(parsed?.tokens).toEqual([
      { playerId: "peer-2", playerName: "Bob", delta: -1, reason: "buzz" },
    ]);
    expect(parsed?.rerolls).toEqual([{ index: 7, reason: "unplayable" }]);
    expect(parsed?.passes).toEqual([{ playerId: "peer-3", playerName: "Cleo" }]);
  });

  it("accepts a round from a host that predates the event log", () => {
    const parsed = parseRoundRecord(
      roundWithEvents({ tokens: undefined, rerolls: undefined, passes: undefined }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.tokens).toEqual([]);
    expect(parsed?.rerolls).toEqual([]);
    expect(parsed?.passes).toEqual([]);
  });

  it.each([
    ["a delta that isn't ±1", { tokens: [{ playerId: "p", playerName: "P", delta: -99, reason: "buzz" }] }],
    ["an unknown token reason", { tokens: [{ playerId: "p", playerName: "P", delta: 1, reason: "cheat" }] }],
    ["an unknown reroll reason", { rerolls: [{ index: 1, reason: "vibes" }] }],
    ["a negative reroll index", { rerolls: [{ index: -1, reason: "unplayable" }] }],
    ["a pass without a player", { passes: [{ playerName: "Ghost" }] }],
  ])("rejects %s", (_label, over) => {
    expect(parseRoundRecord(roundWithEvents(over))).toBeNull();
  });

  it("rejects an event array longer than the cap", () => {
    const tokens = Array.from({ length: MAX_ROUND_ENTRIES + 1 }, () => ({
      playerId: "p",
      playerName: "P",
      delta: -1,
      reason: "buzz",
    }));
    expect(parseRoundRecord(roundWithEvents({ tokens }))).toBeNull();
  });
});
