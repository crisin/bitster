import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

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

import { HostSession } from "./host";
import type { P2PAction } from "./protocol";
import { useGameStore } from "@/game/store";
import { useP2PStore } from "./store";
import { useStreamingStore } from "@/streaming/store";

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
  if (!last || last.action.type !== "game-state") throw new Error("no broadcast");
  return last.action.payload;
}

async function startDemoGame(session: HostSession): Promise<void> {
  await session.handleAction({ type: "join", payload: { name: "Bob" } }, "peer-2");
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
  it("adds a joining peer and broadcasts the state", async () => {
    const session = makeSession();
    await session.handleAction({ type: "join", payload: { name: "Bob" } }, "peer-2");

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
    await session.handleAction({ type: "join", payload: { name: "Bob" } }, "peer-2");
    await session.handleAction({ type: "join", payload: { name: "Carol" } }, "peer-3");

    const error = sent.find((m) => m.action.type === "error");
    expect(error?.target).toBe("peer-3");
    expect(
      error?.action.type === "error" ? error.action.payload.message : "",
    ).toMatch(/full/);
  });

  it("ignores update-settings from a non-host", async () => {
    const session = makeSession();
    await session.handleAction({ type: "join", payload: { name: "Bob" } }, "peer-2");
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
    expect(useP2PStore.getState().peers.map((p) => p.id)).not.toContain("ghost-1");
    session.destroy();
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

    await session.handleAction({ type: "place-song", payload: { position: 0 } }, "host-1");
    const windowState = lastBroadcastState();
    expect(windowState.phase).toBe("hitster-window");
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

    await session.handleAction({ type: "place-song", payload: { position: 0 } }, "peer-2");
    const error = sent.find((m) => m.action.type === "error");
    expect(error?.target).toBe("peer-2");
    expect(lastBroadcastState().phase).toBe("playing");
  });

  it("advances the turn on next-round", async () => {
    const session = makeSession();
    await startDemoGame(session);

    await session.handleAction({ type: "place-song", payload: { position: 0 } }, "host-1");
    await session.handleAction({ type: "reveal-song" }, "host-1");
    await session.handleAction({ type: "next-round" }, "host-1");

    const state = lastBroadcastState();
    expect(state.phase).toBe("playing");
    expect(state.currentPlayerId).toBe("peer-2");
  });

  it("rejects a new join while the game is running", async () => {
    const session = makeSession();
    await startDemoGame(session);

    await session.handleAction({ type: "join", payload: { name: "Late" } }, "peer-9");
    const error = sent.find((m) => m.action.type === "error" && m.target === "peer-9");
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

  it("resets to lobby on rematch", async () => {
    const session = makeSession();
    await startDemoGame(session);

    await session.handleAction({ type: "rematch" }, "host-1");
    const state = lastBroadcastState();
    expect(state.phase).toBe("lobby");
    expect(state.players.every((p) => p.score === 0 && p.tokens === 2)).toBe(true);
    expect(state.playedSongs).toHaveLength(0);
  });
});
