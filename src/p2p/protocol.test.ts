import { addPlayer, buildGameState, createRoom } from "@/game/logic";
import type { GameState } from "@/game/types";
import { describe, expect, it } from "vitest";
import { validateAction, validateGameState } from "./protocol";

function makeValidState(): GameState {
  let room = createRoom("TEST01", "host-1", "Alice");
  room = addPlayer(room, "peer-2", "Bob");
  return buildGameState(room);
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
