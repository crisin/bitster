import { describe, expect, it } from "vitest";
import { addPlayer, buildGameState, createRoom, startGame } from "./logic";
import {
  reconcileGameState,
  reconcilePlayers,
  reconcileTimelines,
} from "./reconcile";
import type { GameState, GameStateMeta, Song } from "./types";

const META: GameStateMeta = { hostNow: 1_700_000_000_000, stateVersion: 1 };

function song(year: number, id = `s${year}`): Song {
  return { id, uri: `spotify:track:${id}`, name: `Song ${year}`, artist: "A", year };
}

function freshState(): GameState {
  let room = createRoom("TEST01", "host-1", "Alice");
  room = addPlayer(room, "peer-2", "Bob");
  room = startGame(room, [song(1990), song(2000)]);
  return buildGameState(room, META);
}

/** Simulate the wire: a re-parsed broadcast has all-new identities */
function reparsed(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function storeSlices(state: GameState) {
  return {
    players: state.players,
    timelines: state.timelines,
    failedTimelines: state.failedTimelines,
    playedSongs: state.playedSongs,
    passedIds: state.passedIds,
    settings: state.settings,
    guessResult: state.guessResult,
    lastResult: state.lastResult,
  };
}

describe("reconcileGameState", () => {
  it("keeps every heavy slice's identity across an unchanged re-broadcast", () => {
    const prev = freshState();
    const next = reconcileGameState(storeSlices(prev), reparsed(prev));
    // The wire gave us all-new objects; the store must hand back the old ones
    expect(next.players).toBe(prev.players);
    expect(next.timelines).toBe(prev.timelines);
    expect(next.failedTimelines).toBe(prev.failedTimelines);
    expect(next.playedSongs).toBe(prev.playedSongs);
    expect(next.passedIds).toBe(prev.passedIds);
    expect(next.settings).toBe(prev.settings);
  });

  it("swaps only the slice that actually changed", () => {
    const prev = freshState();
    const incoming = reparsed(prev);
    incoming.passedIds = ["peer-2"];
    const next = reconcileGameState(storeSlices(prev), incoming);
    expect(next.passedIds).toEqual(["peer-2"]);
    expect(next.passedIds).not.toBe(prev.passedIds);
    // Everything untouched keeps its identity — this is the whole point
    expect(next.players).toBe(prev.players);
    expect(next.timelines).toBe(prev.timelines);
  });

  it("notices a masked year flipping to the real one at reveal", () => {
    const prev = freshState();
    prev.timelines["host-1"] = [{ ...song(1995), year: 0 }];
    const incoming = reparsed(prev);
    incoming.timelines["host-1"] = [song(1995)];
    const next = reconcileGameState(storeSlices(prev), incoming);
    // Same song id, different year — the reveal MUST reach React
    expect(next.timelines).not.toBe(prev.timelines);
    expect(next.timelines["host-1"][0].year).toBe(1995);
  });

  it("keeps untouched players' identity when one player changes", () => {
    const prev = freshState();
    const incoming = reparsed(prev);
    incoming.players = incoming.players.map((p) =>
      p.id === "peer-2" ? { ...p, tokens: p.tokens - 1 } : p,
    );
    const players = reconcilePlayers(storeSlices(prev).players, incoming.players);
    expect(players).not.toBe(prev.players);
    expect(players[0]).toBe(prev.players[0]);
    expect(players[1]).not.toBe(prev.players[1]);
    expect(players[1].tokens).toBe(prev.players[1].tokens - 1);
  });

  it("keeps per-player timeline identity when another timeline grows", () => {
    const prev = freshState();
    prev.timelines["host-1"] = [song(1990)];
    prev.timelines["peer-2"] = [song(2000)];
    const incoming = reparsed(prev);
    incoming.timelines["peer-2"] = [song(2000), song(2010)];
    const timelines = reconcileTimelines(prev.timelines, incoming.timelines);
    expect(timelines).not.toBe(prev.timelines);
    expect(timelines["host-1"]).toBe(prev.timelines["host-1"]);
    expect(timelines["peer-2"]).toHaveLength(2);
  });
});
