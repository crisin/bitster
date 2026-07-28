import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// host.ts → logger → expo/react-native modules that don't parse in node
vi.mock("expo-file-system", () => ({
  Paths: { cache: "/tmp/" },
  File: vi.fn().mockImplementation(() => ({ uri: "/tmp/test.log", text: "" })),
}));
vi.mock("expo-sharing", () => ({
  shareAsync: vi.fn(),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

import { useGameStore } from "@/game/store";
import { useStreamingStore } from "@/streaming/store";
import { HostSession } from "./host";
import type { P2PAction } from "./protocol";
import { useP2PStore } from "./store";

interface SentMessage {
  action: P2PAction;
  target?: string;
}

let sent: SentMessage[];

function makeSession(): HostSession {
  sent = [];
  return new HostSession(
    (action, target) => sent.push({ action, target }),
    "TEST01",
    "host-1",
    "Alice",
  );
}

function lastBroadcastState() {
  const broadcasts = sent.filter(
    (m) => m.action.type === "game-state" && m.target === undefined,
  );
  const last = broadcasts[broadcasts.length - 1];
  if (!last || last.action.type !== "game-state")
    throw new Error("no broadcast");
  return last.action.payload;
}

async function startDemoGame(session: HostSession): Promise<void> {
  await session.handleAction(
    { type: "join", payload: { name: "Bob" } },
    "peer-2",
  );
  // No streaming provider registered in tests → falls back to the demo playlist
  await session.handleAction(
    { type: "start-game", payload: { playlistUrl: "" } },
    "host-1",
  );
}

beforeEach(() => {
  useGameStore.getState().reset();
  useP2PStore.getState().reset();
  useStreamingStore.getState().reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("HostSession — lobby", () => {
  it("refuses to start when a playlist link was entered but can't be resolved", async () => {
    const session = makeSession();
    await session.handleAction(
      { type: "join", payload: { name: "Bob" } },
      "peer-2",
    );
    useStreamingStore.getState().setAuthStatus("authenticated");

    await session.handleAction(
      {
        type: "start-game",
        payload: { playlistUrl: "https://open.spotify.com/playlist/broken" },
      },
      "host-1",
    );

    const error = sent.find((m) => m.action.type === "error");
    expect(error?.target).toBe("host-1");
    expect(lastBroadcastState().phase).toBe("lobby");
  });

  it("starts the silent demo game when no playlist link is entered", async () => {
    const session = makeSession();
    await session.handleAction(
      { type: "join", payload: { name: "Bob" } },
      "peer-2",
    );
    useStreamingStore.getState().setAuthStatus("authenticated");

    await session.handleAction(
      { type: "start-game", payload: { playlistUrl: "" } },
      "host-1",
    );

    expect(lastBroadcastState().phase).toBe("playing");
  });

  it("still starts the demo game when no provider is connected", async () => {
    const session = makeSession();
    await startDemoGame(session);
    expect(lastBroadcastState().phase).toBe("playing");
  });


  it("adds a joining peer and broadcasts the state", async () => {
    const session = makeSession();
    await session.handleAction(
      { type: "join", payload: { name: "Bob" } },
      "peer-2",
    );

    const state = lastBroadcastState();
    expect(state.players.map((p) => p.name)).toEqual(["Alice", "Bob"]);
    expect(state.phase).toBe("lobby");
  });

  it("rejects a join when the room is full, with a targeted error", async () => {
    const session = makeSession();
    await session.handleAction(
      { type: "update-settings", payload: { maxPlayers: 2 } },
      "host-1",
    );
    await session.handleAction(
      { type: "join", payload: { name: "Bob" } },
      "peer-2",
    );
    await session.handleAction(
      { type: "join", payload: { name: "Carol" } },
      "peer-3",
    );

    const error = sent.find((m) => m.action.type === "error");
    expect(error?.target).toBe("peer-3");
    expect(
      error?.action.type === "error" ? error.action.payload.message : "",
    ).toMatch(/full/);
  });

  it("ignores update-settings from a non-host", async () => {
    const session = makeSession();
    await session.handleAction(
      { type: "join", payload: { name: "Bob" } },
      "peer-2",
    );
    await session.handleAction(
      { type: "update-settings", payload: { winScore: 1 } },
      "peer-2",
    );
    expect(lastBroadcastState().settings.winScore).toBe(10);
  });

  it("prunes a connected peer that never sends join", () => {
    vi.useFakeTimers();
    const session = makeSession();
    session.handlePeerConnected("ghost-1");
    expect(useP2PStore.getState().peers.map((p) => p.id)).toContain("ghost-1");

    vi.advanceTimersByTime(11_000);
    expect(useP2PStore.getState().peers.map((p) => p.id)).not.toContain(
      "ghost-1",
    );
    session.destroy();
  });
});

describe("HostSession — local players (pass-and-play)", () => {
  it("adds and removes local players, host only", async () => {
    const session = makeSession();
    await session.handleAction(
      { type: "join", payload: { name: "Bob" } },
      "peer-2",
    );

    // Peers may not manage local players
    await session.handleAction(
      { type: "add-local-player", payload: { name: "Sneaky" } },
      "peer-2",
    );
    expect(lastBroadcastState().players).toHaveLength(2);

    await session.handleAction(
      { type: "add-local-player", payload: { name: "Karl" } },
      "host-1",
    );
    const withKarl = lastBroadcastState();
    expect(withKarl.players).toHaveLength(3);
    const karl = withKarl.players.find((p) => p.name === "Karl");
    expect(karl?.isLocal).toBe(true);

    await session.handleAction(
      { type: "remove-local-player", payload: { playerId: karl!.id } },
      "host-1",
    );
    expect(lastBroadcastState().players).toHaveLength(2);
  });

  it("refuses to remove an online player via remove-local-player", async () => {
    const session = makeSession();
    await session.handleAction(
      { type: "join", payload: { name: "Bob" } },
      "peer-2",
    );
    await session.handleAction(
      { type: "remove-local-player", payload: { playerId: "peer-2" } },
      "host-1",
    );
    expect(lastBroadcastState().players).toHaveLength(2);
  });

  it("lets a local player take a full turn", async () => {
    const session = makeSession();
    await session.handleAction(
      { type: "add-local-player", payload: { name: "Karl" } },
      "host-1",
    );
    const karlId = lastBroadcastState().players.find(
      (p) => p.name === "Karl",
    )!.id;
    await startDemoGame(session);

    // Round 1: host plays through
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await session.handleAction({ type: "reveal-song" }, "host-1");
    await session.handleAction({ type: "next-round" }, "host-1");

    // Round 2: the local player is on turn — actions arrive AS the local id
    expect(lastBroadcastState().currentPlayerId).toBe(karlId);
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      karlId,
    );
    expect(lastBroadcastState().phase).toBe("bitster-window");
    await session.handleAction({ type: "reveal-song" }, "host-1");
    const reveal = lastBroadcastState();
    expect(reveal.phase).toBe("reveal");
    expect(reveal.timelines[karlId]).toHaveLength(1);

    await session.handleAction({ type: "next-round" }, "host-1");
    expect(lastBroadcastState().currentPlayerId).toBe("peer-2");
  });
});

describe("HostSession — game flow", () => {
  it("starts the demo game and hides the current song from playedSongs", async () => {
    const session = makeSession();
    await startDemoGame(session);

    const state = lastBroadcastState();
    expect(state.phase).toBe("playing");
    expect(state.currentSongUri).not.toBeNull();
    // Answer-leak regression: the playing song must not be listed
    expect(state.playedSongs).toHaveLength(0);
    // Song was announced for playback
    expect(sent.some((m) => m.action.type === "play-song")).toBe(true);
  });

  it("runs place → reveal with the result withheld until reveal", async () => {
    const session = makeSession();
    await startDemoGame(session);

    const current = lastBroadcastState().currentPlayerId;
    expect(current).toBe("host-1");

    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    const windowState = lastBroadcastState();
    expect(windowState.phase).toBe("bitster-window");
    expect(windowState.lastResult).toBeNull();

    await session.handleAction({ type: "reveal-song" }, "host-1");
    const revealState = lastBroadcastState();
    expect(revealState.phase).toBe("reveal");
    expect(revealState.lastResult).not.toBeNull();
    expect(revealState.lastResult?.correct).toBe(true); // first song is always correct
    // Now the song may appear in playedSongs
    expect(revealState.playedSongs).toHaveLength(1);
  });

  it("rejects place-song from a player who is not on turn", async () => {
    const session = makeSession();
    await startDemoGame(session);

    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "peer-2",
    );
    const error = sent.find((m) => m.action.type === "error");
    expect(error?.target).toBe("peer-2");
    expect(lastBroadcastState().phase).toBe("playing");
  });

  it("advances the turn on next-round", async () => {
    const session = makeSession();
    await startDemoGame(session);

    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await session.handleAction({ type: "reveal-song" }, "host-1");
    await session.handleAction({ type: "next-round" }, "host-1");

    const state = lastBroadcastState();
    expect(state.phase).toBe("playing");
    expect(state.currentPlayerId).toBe("peer-2");
  });

  it("rejects a new join while the game is running", async () => {
    const session = makeSession();
    await startDemoGame(session);

    await session.handleAction(
      { type: "join", payload: { name: "Late" } },
      "peer-9",
    );
    const error = sent.find(
      (m) => m.action.type === "error" && m.target === "peer-9",
    );
    expect(
      error?.action.type === "error" ? error.action.payload.message : "",
    ).toMatch(/in progress/);
  });

  it("ends the game when a player leaves and fewer than 2 remain", async () => {
    const session = makeSession();
    await startDemoGame(session);

    session.handlePeerLeft("peer-2");
    expect(lastBroadcastState().phase).toBe("finished");
  });

  it("blocks reveal-song while a bitster challenge is running", async () => {
    const session = makeSession();
    await startDemoGame(session);
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await session.handleAction({ type: "bitster-buzz" }, "peer-2");

    const buzzState = lastBroadcastState();
    expect(buzzState.buzzerId).toBe("peer-2");
    expect(buzzState.buzzDeadline).not.toBeNull();

    await session.handleAction({ type: "reveal-song" }, "host-1");
    expect(lastBroadcastState().phase).toBe("bitster-window");
    session.destroy();
  });

  it("forfeits the buzz when the timer expires without a pick", async () => {
    vi.useFakeTimers();
    const session = makeSession();
    await startDemoGame(session);
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await session.handleAction({ type: "bitster-buzz" }, "peer-2");

    vi.advanceTimersByTime(31_000);
    const state = lastBroadcastState();
    expect(state.phase).toBe("reveal");
    expect(state.buzzerId).toBeNull();
    // The wasted token stays spent
    expect(state.players.find((p) => p.id === "peer-2")?.tokens).toBe(1);
    session.destroy();
  });

  it("resolves the challenge immediately on buzz-place", async () => {
    const session = makeSession();
    await startDemoGame(session);
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await session.handleAction({ type: "bitster-buzz" }, "peer-2");
    await session.handleAction(
      { type: "buzz-place", payload: { position: 0 } },
      "peer-2",
    );

    const state = lastBroadcastState();
    expect(state.phase).toBe("reveal");
    expect(state.buzzerId).toBeNull();
    session.destroy();
  });

  it("auto-reveals once every challenger passed", async () => {
    const session = makeSession();
    await startDemoGame(session);
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await session.handleAction({ type: "bitster-pass" }, "peer-2");

    const state = lastBroadcastState();
    expect(state.phase).toBe("reveal");
    expect(state.lastResult).not.toBeNull();
    session.destroy();
  });

  it("resets to lobby on rematch", async () => {
    const session = makeSession();
    await startDemoGame(session);

    await session.handleAction({ type: "rematch" }, "host-1");
    const state = lastBroadcastState();
    expect(state.phase).toBe("lobby");
    expect(state.players.every((p) => p.score === 0 && p.tokens === 2)).toBe(
      true,
    );
    expect(state.playedSongs).toHaveLength(0);
  });
});

describe("HostSession — new-rules hardening", () => {
  it("rejects a second guess in the same round and leaks no tokens early", async () => {
    const session = makeSession();
    await startDemoGame(session);

    await session.handleAction(
      { type: "guess-song", payload: { title: "wrong", artist: "wrong" } },
      "host-1",
    );
    // Tokens unchanged in the broadcast — reward (if any) lands at reveal
    expect(lastBroadcastState().players.map((p) => p.tokens)).toEqual([2, 2]);

    await session.handleAction(
      { type: "guess-song", payload: { title: "again", artist: "again" } },
      "host-1",
    );
    const error = sent.find((m) => m.action.type === "error");
    expect(
      error?.action.type === "error" ? error.action.payload.message : "",
    ).toMatch(/Already guessed/);
  });

  it("locks settings once the game is running", async () => {
    const session = makeSession();
    await startDemoGame(session);

    await session.handleAction(
      { type: "update-settings", payload: { winScore: 1 } },
      "host-1",
    );
    expect(lastBroadcastState().settings.winScore).toBe(10);
    const error = sent.find((m) => m.action.type === "error");
    expect(
      error?.action.type === "error" ? error.action.payload.message : "",
    ).toMatch(/lobby/);
  });

  it("blitz: forfeits the placement when the timer expires", async () => {
    vi.useFakeTimers();
    const session = makeSession();
    await session.handleAction(
      { type: "join", payload: { name: "Bob" } },
      "peer-2",
    );
    await session.handleAction(
      {
        type: "update-settings",
        payload: {
          rules: {
            buzz: { enabled: true, penalty: "none", timerSeconds: 30 },
            placement: { timerSeconds: 10 },
          },
        },
      },
      "host-1",
    );
    await session.handleAction(
      { type: "start-game", payload: { playlistUrl: "" } },
      "host-1",
    );
    expect(lastBroadcastState().placeDeadline).not.toBeNull();

    await vi.advanceTimersByTimeAsync(10_000);

    const state = lastBroadcastState();
    expect(state.phase).toBe("reveal");
    expect(state.lastResult?.correct).toBe(false);
    expect(state.lastResult?.timedOut).toBe(true);
    // Song went straight to the failed pile, no card on the timeline
    expect(state.timelines["host-1"]).toHaveLength(0);
    expect(state.failedTimelines["host-1"]).toHaveLength(1);
    expect(state.placeDeadline).toBeNull();
    session.destroy();
  });

  it("blitz: placing in time disarms the countdown", async () => {
    vi.useFakeTimers();
    const session = makeSession();
    await session.handleAction(
      { type: "join", payload: { name: "Bob" } },
      "peer-2",
    );
    await session.handleAction(
      {
        type: "update-settings",
        payload: {
          rules: {
            buzz: { enabled: true, penalty: "none", timerSeconds: 30 },
            placement: { timerSeconds: 10 },
          },
        },
      },
      "host-1",
    );
    await session.handleAction(
      { type: "start-game", payload: { playlistUrl: "" } },
      "host-1",
    );
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    expect(lastBroadcastState().phase).toBe("bitster-window");

    // The old countdown must NOT fire into the bitster-window
    await vi.advanceTimersByTimeAsync(11_000);
    expect(lastBroadcastState().phase).toBe("bitster-window");
    session.destroy();
  });

  it("does not double-spend tokens on a concurrent second skip", async () => {
    const session = makeSession();
    await startDemoGame(session);

    // Fire two skips without awaiting in between — the second must be a no-op
    const first = session.handleAction({ type: "skip-song" }, "host-1");
    const second = session.handleAction({ type: "skip-song" }, "host-1");
    await Promise.all([first, second]);

    const state = lastBroadcastState();
    const host = state.players.find((p) => p.id === "host-1");
    expect(host?.tokens).toBe(1); // 2 - 1, NOT 2 - 2
    expect(host?.stats.skips).toBe(1);
  });

  it("rejects an out-of-range buzz-select with feedback", async () => {
    const session = makeSession();
    await startDemoGame(session);
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await session.handleAction({ type: "bitster-buzz" }, "peer-2");

    await session.handleAction(
      { type: "buzz-select", payload: { position: 99 } },
      "peer-2",
    );
    const error = sent.find(
      (m) => m.action.type === "error" && m.target === "peer-2",
    );
    expect(
      error?.action.type === "error" ? error.action.payload.message : "",
    ).toMatch(/Invalid placement/);
    session.destroy();
  });

  it("trims and caps player names", async () => {
    const session = makeSession();
    await session.handleAction(
      { type: "join", payload: { name: "  Bob" + "b".repeat(60) + "  " } },
      "peer-2",
    );
    const state = lastBroadcastState();
    const bob = state.players.find((p) => p.id === "peer-2");
    expect(bob?.name.length).toBeLessThanOrEqual(24);
    expect(bob?.name.startsWith("Bob")).toBe(true);
  });
});
