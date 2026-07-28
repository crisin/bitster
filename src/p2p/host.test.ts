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
import { DEFAULT_RULES } from "@/game/types";
import { registerProvider } from "@/streaming/registry";
import { useStreamingStore } from "@/streaming/store";
import type { Track } from "@/streaming/types";
import { StreamingFetchError } from "@/streaming/types";
import { HostSession } from "./host";
import type { P2PAction } from "./protocol";
import type { SessionStorage } from "./session";
import { configureSessionStorage } from "./session";
import { useP2PStore } from "./store";

/** Neither localStorage nor AsyncStorage exists under vitest's node env */
function memoryStorage(): SessionStorage {
  const data = new Map<string, string>();
  return {
    async get(key) {
      return data.get(key) ?? null;
    },
    async set(key, value) {
      data.set(key, value);
    },
    async remove(key) {
      data.delete(key);
    },
    setSync(key, value) {
      data.set(key, value);
      return true;
    },
  };
}

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

function lastRecap() {
  const recaps = sent.filter((m) => m.action.type === "game-recap");
  const last = recaps[recaps.length - 1];
  return last && last.action.type === "game-recap" ? last.action.payload : null;
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
  configureSessionStorage(memoryStorage());
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

    // The host has no socket of its own — its errors land in the store the
    // banner reads from, not on the wire
    expect(useP2PStore.getState().lastError).toMatch(/playlist/i);
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
    // Turn order is the seating order: host, Karl, Bob
    await giveEveryoneACard(session, ["host-1", karlId, "peer-2"]);

    // Host plays through — now everyone owns a card, so a window opens
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await session.handleAction({ type: "reveal-song" }, "host-1");
    await session.handleAction({ type: "next-round" }, "host-1");

    // The local player is on turn — actions arrive AS the local id
    expect(lastBroadcastState().currentPlayerId).toBe(karlId);
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      karlId,
    );
    expect(lastBroadcastState().phase).toBe("bitster-window");
    await session.handleAction({ type: "reveal-song" }, "host-1");
    const reveal = lastBroadcastState();
    expect(reveal.phase).toBe("reveal");
    // Their opening card is safe; the second one depends on the random song
    expect(reveal.timelines[karlId]!.length).toBeGreaterThanOrEqual(1);

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
    await giveEveryoneACard(session, ["host-1","peer-2"]);

    const current = lastBroadcastState().currentPlayerId;
    expect(current).toBe("host-1");

    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    const windowState = lastBroadcastState();
    expect(windowState.phase).toBe("bitster-window");
    expect(windowState.lastResult).toBeNull();

    const hiddenSongs = windowState.playedSongs.length;

    await session.handleAction({ type: "reveal-song" }, "host-1");
    const revealState = lastBroadcastState();
    expect(revealState.phase).toBe("reveal");
    expect(revealState.lastResult).not.toBeNull();
    // Whether it was right depends on the random song; that it is DECIDED now,
    // and only now, is the point
    expect(typeof revealState.lastResult?.correct).toBe("boolean");
    // Only now may the song join playedSongs
    expect(revealState.playedSongs.length).toBe(hiddenSongs + 1);
  });

  it("skips the challenge window for an opening card", async () => {
    const session = makeSession();
    await startDemoGame(session);

    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );

    // Nothing to challenge — a card dropped into an empty timeline is right by
    // definition, so the window would only cost somebody a token
    expect(lastBroadcastState().phase).toBe("reveal");
    const sawWindow = sent.some(
      (m) =>
        m.action.type === "game-state" &&
        m.action.payload.phase === "bitster-window",
    );
    expect(sawWindow).toBe(false);
    session.destroy();
  });

  it("opens the window again once the player owns a card", async () => {
    const session = makeSession();
    await startDemoGame(session);
    await giveEveryoneACard(session, ["host-1", "peer-2"]);

    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    expect(lastBroadcastState().phase).toBe("bitster-window");
    session.destroy();
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

  it("ends the game once a departed player's grace expires and fewer than 2 remain", async () => {
    vi.useFakeTimers();
    const session = makeSession();
    await startDemoGame(session);

    session.handlePeerDisconnected("peer-2");
    // A blip must not end the game — the seat is held first
    expect(lastBroadcastState().phase).not.toBe("finished");

    await vi.advanceTimersByTimeAsync(61_000);
    expect(lastBroadcastState().phase).toBe("finished");
  });

  it("blocks reveal-song while a bitster challenge is running", async () => {
    const session = makeSession();
    await startDemoGame(session);
    await giveEveryoneACard(session, ["host-1","peer-2"]);
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
    await giveEveryoneACard(session, ["host-1","peer-2"]);
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
    expect(useP2PStore.getState().lastError).toMatch(/Already guessed/);
  });

  it("locks settings once the game is running", async () => {
    const session = makeSession();
    await startDemoGame(session);

    await session.handleAction(
      { type: "update-settings", payload: { winScore: 1 } },
      "host-1",
    );
    expect(lastBroadcastState().settings.winScore).toBe(10);
    expect(useP2PStore.getState().lastError).toMatch(/lobby/);
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

            skip: DEFAULT_RULES.skip,

            guess: DEFAULT_RULES.guess,

            tokens: DEFAULT_RULES.tokens,
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

            skip: DEFAULT_RULES.skip,

            guess: DEFAULT_RULES.guess,

            tokens: DEFAULT_RULES.tokens,
          },
        },
      },
      "host-1",
    );
    await session.handleAction(
      { type: "start-game", payload: { playlistUrl: "" } },
      "host-1",
    );
    // Opening cards can't be challenged, so a window needs a second one
    await giveEveryoneACard(session, ["host-1", "peer-2"]);
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
    await giveEveryoneACard(session, ["host-1", "peer-2"]);
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

/** Everyone must be seated BEFORE the game starts — mid-game joins are refused */
async function startDemoGameWith(
  session: HostSession,
  peers: { id: string; name: string }[],
): Promise<void> {
  for (const p of peers) {
    await session.handleAction(
      { type: "join", payload: { name: p.name } },
      p.id,
    );
  }
  await session.handleAction(
    { type: "start-game", payload: { playlistUrl: "" } },
    "host-1",
  );
}

/**
 * Play one card for everybody. A first card cannot be placed wrong, so the
 * host skips the challenge window entirely — a test that needs the window has
 * to get past everyone's opening card first.
 */
async function giveEveryoneACard(
  session: HostSession,
  playerIds: string[],
): Promise<void> {
  for (const id of playerIds) {
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      id,
    );
    await session.handleAction({ type: "next-round" }, "host-1");
  }
}

describe("HostSession — disconnect grace", () => {
  it("keeps a disconnected player and their timeline until the grace expires", async () => {
    vi.useFakeTimers();
    const session = makeSession();
    await startDemoGameWith(session, [
      { id: "peer-2", name: "Bob" },
      { id: "peer-3", name: "Cleo" },
    ]);
    await giveEveryoneACard(session, ["host-1","peer-2","peer-3"]);
    // Give Bob a card: host places, everyone passes, then Bob is on turn
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await session.handleAction({ type: "bitster-pass" }, "peer-2");
    await session.handleAction({ type: "bitster-pass" }, "peer-3");
    await session.handleAction({ type: "next-round" }, "host-1");
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "peer-2",
    );
    const timelineBefore = lastBroadcastState().timelines["peer-2"]?.length ?? 0;
    expect(timelineBefore).toBeGreaterThan(0);

    session.handlePeerDisconnected("peer-2");
    const during = lastBroadcastState();
    const bob = during.players.find((p) => p.id === "peer-2");
    expect(bob).toBeDefined();
    expect(bob?.connected).toBe(false);
    expect(bob?.disconnectedUntil).not.toBeNull();
    expect(during.timelines["peer-2"]?.length ?? 0).toBe(timelineBefore);

    await vi.advanceTimersByTimeAsync(61_000);
    expect(
      lastBroadcastState().players.find((p) => p.id === "peer-2"),
    ).toBeUndefined();
    session.destroy();
  });

  it("restores the seat, timeline and tokens when the same peer id returns", async () => {
    vi.useFakeTimers();
    const session = makeSession();
    await startDemoGameWith(session, [
      { id: "peer-2", name: "Bob" },
      { id: "peer-3", name: "Cleo" },
    ]);
    const tokensBefore =
      lastBroadcastState().players.find((p) => p.id === "peer-2")?.tokens ?? 0;

    session.handlePeerDisconnected("peer-2");
    await vi.advanceTimersByTimeAsync(30_000);
    session.handlePeerConnected("peer-2");

    const after = lastBroadcastState();
    const bob = after.players.find((p) => p.id === "peer-2");
    expect(bob?.connected).toBe(true);
    expect(bob?.disconnectedUntil).toBeNull();
    expect(bob?.tokens).toBe(tokensBefore);

    // The grace timer must be cancelled, not merely ignored
    await vi.advanceTimersByTimeAsync(61_000);
    expect(
      lastBroadcastState().players.find((p) => p.id === "peer-2"),
    ).toBeDefined();
    session.destroy();
  });

  it("removes a peer immediately when they drop while still in the lobby", async () => {
    const session = makeSession();
    await session.handleAction(
      { type: "join", payload: { name: "Bob" } },
      "peer-2",
    );
    session.handlePeerDisconnected("peer-2");
    expect(
      lastBroadcastState().players.find((p) => p.id === "peer-2"),
    ).toBeUndefined();
    session.destroy();
  });

  it("never drops a player who disconnects after the game is finished", async () => {
    vi.useFakeTimers();
    const session = makeSession();
    await session.handleAction(
      { type: "update-settings", payload: { winScore: 1 } },
      "host-1",
    );
    await startDemoGameWith(session, [
      { id: "peer-2", name: "Bob" },
      { id: "peer-3", name: "Cleo" },
    ]);
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await session.handleAction({ type: "bitster-pass" }, "peer-2");
    await session.handleAction({ type: "bitster-pass" }, "peer-3");
    await session.handleAction({ type: "next-round" }, "host-1");
    expect(lastBroadcastState().phase).toBe("finished");

    session.handlePeerDisconnected("peer-2");
    await vi.advanceTimersByTimeAsync(120_000);
    const bob = lastBroadcastState().players.find((p) => p.id === "peer-2");
    expect(bob).toBeDefined();
    expect(bob?.connected).toBe(false);
    session.destroy();
  });

  it("passes the turn on after the turn grace when the active player is offline", async () => {
    vi.useFakeTimers();
    const session = makeSession();
    await startDemoGameWith(session, [
      { id: "peer-2", name: "Bob" },
      { id: "peer-3", name: "Cleo" },
    ]);
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await session.handleAction({ type: "bitster-pass" }, "peer-2");
    await session.handleAction({ type: "bitster-pass" }, "peer-3");
    await session.handleAction({ type: "next-round" }, "host-1");
    expect(lastBroadcastState().currentPlayerId).toBe("peer-2");

    session.handlePeerDisconnected("peer-2");
    await vi.advanceTimersByTimeAsync(21_000);
    const after = lastBroadcastState();
    expect(after.currentPlayerId).toBe("peer-3");
    // Only the turn moved on — the seat is still held
    expect(after.players.find((p) => p.id === "peer-2")).toBeDefined();
    session.destroy();
  });

  it("keeps the tentative placement when a challenger drops during bitster-window", async () => {
    vi.useFakeTimers();
    const session = makeSession();
    await startDemoGameWith(session, [
      { id: "peer-2", name: "Bob" },
      { id: "peer-3", name: "Cleo" },
    ]);
    await giveEveryoneACard(session, ["host-1","peer-2","peer-3"]);
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    expect(lastBroadcastState().phase).toBe("bitster-window");

    const placedCount = lastBroadcastState().timelines["host-1"]?.length ?? 0;

    session.handlePeerDisconnected("peer-3");
    const state = lastBroadcastState();
    expect(state.phase).toBe("bitster-window");
    // The tentatively placed card stays put — a disconnect elsewhere at the
    // table must not undo it
    expect(state.timelines["host-1"]?.length).toBe(placedCount);
    session.destroy();
  });

  it("reveals immediately when the last live challenger disconnects", async () => {
    vi.useFakeTimers();
    const session = makeSession();
    await startDemoGameWith(session, [{ id: "peer-2", name: "Bob" }]);
    await giveEveryoneACard(session, ["host-1","peer-2"]);
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    expect(lastBroadcastState().phase).toBe("bitster-window");

    session.handlePeerDisconnected("peer-2");
    expect(lastBroadcastState().phase).toBe("reveal");
    session.destroy();
  });

  it("marks a wrongly-offline player connected again when an action arrives", async () => {
    vi.useFakeTimers();
    const session = makeSession();
    await startDemoGameWith(session, [
      { id: "peer-2", name: "Bob" },
      { id: "peer-3", name: "Cleo" },
    ]);
    await giveEveryoneACard(session, ["host-1","peer-2","peer-3"]);
    session.handlePeerDisconnected("peer-3");
    expect(
      lastBroadcastState().players.find((p) => p.id === "peer-3")?.connected,
    ).toBe(false);

    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await session.handleAction({ type: "bitster-pass" }, "peer-3");
    expect(
      lastBroadcastState().players.find((p) => p.id === "peer-3")?.connected,
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(
      lastBroadcastState().players.find((p) => p.id === "peer-3"),
    ).toBeDefined();
    session.destroy();
  });

  it("rejects an unknown peer id once the game is running", async () => {
    const session = makeSession();
    await startDemoGameWith(session, [{ id: "peer-2", name: "Bob" }]);
    session.handlePeerConnected("peer-ghost");
    const error = sent.find(
      (m) => m.action.type === "error" && m.target === "peer-ghost",
    );
    expect(
      error?.action.type === "error" ? error.action.payload.message : "",
    ).toMatch(/expired|already over/);
    session.destroy();
  });
});

describe("HostSession — song fetching", () => {
  const TRACK: Track = {
    id: "t1",
    uri: "spotify:track:t1",
    name: "Song",
    artist: "Artist",
    year: 1985,
  };

  /** Registers a fake provider and returns a handle to steer its answers */
  function fakeProvider(answers: (() => Promise<Track | null>)[]) {
    let call = 0;
    const indices: number[] = [];
    registerProvider({
      id: "fake",
      name: "Fake",
      color: "#000",
      icon: "🎧",
      auth: {
        login: async () => {},
        logout: async () => {},
        isAuthenticated: () => true,
        refreshToken: async () => {},
      },
      player: {
        play: async () => {},
        pause: async () => {},
        getDevices: async () => [],
        setDevice: async () => {},
      },
      library: {
        getTrackAtIndex: async (_id, index) => {
          indices.push(index);
          const answer = answers[Math.min(call, answers.length - 1)];
          call++;
          return answer();
        },
        parsePlaylistUrl: () => "playlist-1",
        buildPlaylistUrl: (id) => `https://example.test/${id}`,
        getPlaylistMeta: async () => ({
          id: "playlist-1",
          name: "Fake Playlist",
          trackCount: 50,
          imageUrl: null,
        }),
      },
    });
    useStreamingStore.getState().setActiveProvider("fake");
    return { indices, calls: () => call };
  }

  async function startFetchGame(session: HostSession): Promise<void> {
    await session.handleAction(
      { type: "join", payload: { name: "Bob" } },
      "peer-2",
    );
    await session.handleAction(
      {
        type: "start-game",
        payload: { playlistUrl: "https://open.spotify.com/playlist/x" },
      },
      "host-1",
    );
  }

  it("does not burn playlist slots when the REQUEST fails", async () => {
    const failing = () =>
      Promise.reject(new StreamingFetchError("rate limited", true, 429));
    const fake = fakeProvider([failing]);
    const session = makeSession();
    await startFetchGame(session);

    const state = lastBroadcastState();
    // Every attempt failed, so the game cannot continue — but not one slot
    // may have been marked as used, or the playlist would erode.
    expect(state.playedSongs).toHaveLength(0);
    expect(fake.calls()).toBeGreaterThan(1);
    expect(useP2PStore.getState().lastError).toMatch(/Couldn't load/i);
    session.destroy();
  });

  it("recovers when a transient failure is followed by a good track", async () => {
    let first = true;
    fakeProvider([
      () => {
        if (first) {
          first = false;
          return Promise.reject(
            new StreamingFetchError("hiccup", true, 503),
          );
        }
        return Promise.resolve(TRACK);
      },
    ]);
    const session = makeSession();
    await startFetchGame(session);

    expect(lastBroadcastState().phase).toBe("playing");
    expect(lastBroadcastState().currentSongId).toBe("t1");
    session.destroy();
  });

  it("burns the slot when the track itself is unusable", async () => {
    let served = 0;
    fakeProvider([
      () => {
        served++;
        return Promise.resolve(served === 1 ? null : TRACK);
      },
    ]);
    const session = makeSession();
    await startFetchGame(session);

    expect(lastBroadcastState().phase).toBe("playing");
    // The dud index is remembered so it never comes back
    expect(lastBroadcastState().currentSongId).toBe("t1");
    session.destroy();
  });

  it("gives up immediately on a hard failure", async () => {
    const fake = fakeProvider([
      () => Promise.reject(new StreamingFetchError("gone", false, 404)),
    ]);
    const session = makeSession();
    await startFetchGame(session);

    expect(fake.calls()).toBe(1);
    expect(useP2PStore.getState().lastError).toMatch(/Couldn't load/i);
    session.destroy();
  });
});

describe("HostSession — round log and recap", () => {
  it("logs a completed round with the real year and the chosen gap", async () => {
    const session = makeSession();
    await startDemoGameWith(session, [
      { id: "peer-2", name: "Bob" },
      { id: "peer-3", name: "Cleo" },
    ]);
    await giveEveryoneACard(session, ["host-1","peer-2","peer-3"]);
    await session.handleAction(
      { type: "guess-song", payload: { title: "Wrong", artist: "Nobody" } },
      "host-1",
    );
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    // The broadcast during the window must still be masked...
    expect(
      lastBroadcastState().timelines["host-1"]?.some((s) => s.year === 0),
    ).toBe(true);
    await session.handleAction({ type: "reveal-song" }, "host-1");

    await finishViaRematch(session);
    const recap = lastRecap();
    // The opening cards are logged too — this test is about the last round
    const round = recap!.rounds[recap!.rounds.length - 1]!;
    // ...while the log holds the truth
    expect(round.song.year).toBeGreaterThan(1900);
    expect(round.outcome).toBe("placed");
    expect(round.position).toBe(0);
    expect(round.activePlayerId).toBe("host-1");
    expect(round.guess?.title).toBe("Wrong");
    expect(round.guess?.titleCorrect).toBe(false);
    session.destroy();
  });

  it("logs a skip with the guess and no reward", async () => {
    const session = makeSession();
    await startDemoGameWith(session, [{ id: "peer-2", name: "Bob" }]);
    await session.handleAction(
      { type: "guess-song", payload: { title: "Nope", artist: "Nobody" } },
      "host-1",
    );
    await session.handleAction({ type: "skip-song" }, "host-1");

    await finishViaRematch(session);
    const round = lastRecap()!.rounds[0];
    expect(round.outcome).toBe("skipped");
    expect(round.correct).toBeNull();
    expect(round.guess?.tokens).toBe(0);
    session.destroy();
  });

  it("logs a blitz timeout", async () => {
    vi.useFakeTimers();
    const session = makeSession();
    await session.handleAction(
      {
        type: "update-settings",
        payload: {
          rules: {
            buzz: { enabled: true, penalty: "none", timerSeconds: 30 },
            placement: { timerSeconds: 10 },

            skip: DEFAULT_RULES.skip,

            guess: DEFAULT_RULES.guess,

            tokens: DEFAULT_RULES.tokens,
          },
        },
      },
      "host-1",
    );
    await startDemoGameWith(session, [{ id: "peer-2", name: "Bob" }]);
    await vi.advanceTimersByTimeAsync(11_000);

    await finishViaRematch(session);
    const round = lastRecap()!.rounds[0];
    expect(round.outcome).toBe("timeout");
    expect(round.correct).toBe(false);
    session.destroy();
  });

  it("logs a successful steal against the player who lost the card", async () => {
    const session = makeSession();
    await startDemoGameWith(session, [
      { id: "peer-2", name: "Bob" },
      { id: "peer-3", name: "Cleo" },
    ]);
    await giveEveryoneACard(session, ["host-1","peer-2","peer-3"]);
    // Two cards for the host so a wrong placement is possible
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await session.handleAction({ type: "reveal-song" }, "host-1");
    await session.handleAction({ type: "next-round" }, "host-1");
    // Bob places, Cleo buzzes and takes it
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "peer-2",
    );
    await session.handleAction({ type: "bitster-buzz" }, "peer-3");
    await session.handleAction(
      { type: "buzz-place", payload: { position: 0 } },
      "peer-3",
    );

    await finishViaRematch(session);
    const stolenRound = lastRecap()!.rounds.find((r) => r.buzz !== null);
    expect(stolenRound?.buzz?.playerId).toBe("peer-3");
    expect(stolenRound?.buzz?.playerName).toBe("Cleo");
    expect(typeof stolenRound?.buzz?.stolen).toBe("boolean");
    session.destroy();
  });

  it("logs a forfeited buzz with no position", async () => {
    vi.useFakeTimers();
    const session = makeSession();
    await startDemoGameWith(session, [
      { id: "peer-2", name: "Bob" },
      { id: "peer-3", name: "Cleo" },
    ]);
    await giveEveryoneACard(session, ["host-1","peer-2","peer-3"]);
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await session.handleAction({ type: "bitster-buzz" }, "peer-2");
    await vi.advanceTimersByTimeAsync(31_000);

    await finishViaRematch(session);
    const rounds = lastRecap()!.rounds;
    const round = rounds[rounds.length - 1]!;
    expect(round.buzz?.playerId).toBe("peer-2");
    expect(round.buzz?.position).toBeNull();
    expect(round.buzz?.stolen).toBe(false);
    session.destroy();
  });

  it("logs an abandoned round when the active player is dropped mid-turn", async () => {
    vi.useFakeTimers();
    const session = makeSession();
    await startDemoGameWith(session, [
      { id: "peer-2", name: "Bob" },
      { id: "peer-3", name: "Cleo" },
    ]);
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await session.handleAction({ type: "reveal-song" }, "host-1");
    await session.handleAction({ type: "next-round" }, "host-1");
    expect(lastBroadcastState().currentPlayerId).toBe("peer-2");

    session.handlePeerDisconnected("peer-2");
    await vi.advanceTimersByTimeAsync(61_000);

    await finishViaRematch(session);
    const abandoned = lastRecap()!.rounds.find((r) => r.outcome === "abandoned");
    expect(abandoned?.activePlayerName).toBe("Bob");
    session.destroy();
  });

  it("does not log a round twice when someone drops during the reveal", async () => {
    vi.useFakeTimers();
    const session = makeSession();
    await startDemoGameWith(session, [
      { id: "peer-2", name: "Bob" },
      { id: "peer-3", name: "Cleo" },
    ]);
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await session.handleAction({ type: "reveal-song" }, "host-1");
    session.handlePeerDisconnected("peer-3");
    await vi.advanceTimersByTimeAsync(61_000);

    await finishViaRematch(session);
    expect(lastRecap()!.rounds.filter((r) => r.round === 1)).toHaveLength(1);
    session.destroy();
  });

  it("sends no recap before the game is over, and exactly one after", async () => {
    const session = makeSession();
    await session.handleAction(
      { type: "update-settings", payload: { winScore: 1 } },
      "host-1",
    );
    await startDemoGameWith(session, [{ id: "peer-2", name: "Bob" }]);
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    expect(lastRecap()).toBeNull();
    await session.handleAction({ type: "reveal-song" }, "host-1");
    expect(lastRecap()).toBeNull();

    await session.handleAction({ type: "next-round" }, "host-1");
    expect(lastBroadcastState().phase).toBe("finished");
    expect(sent.filter((m) => m.action.type === "game-recap")).toHaveLength(1);
    expect(lastRecap()?.endedReason).toBe("win");
    expect(lastRecap()?.winnerId).toBe("host-1");

    // Further broadcasts must not re-emit it
    session.broadcastState();
    expect(sent.filter((m) => m.action.type === "game-recap")).toHaveLength(1);
    session.destroy();
  });

  it("reports an abandoned game with no winner", async () => {
    vi.useFakeTimers();
    const session = makeSession();
    await startDemoGameWith(session, [{ id: "peer-2", name: "Bob" }]);
    session.handlePeerDisconnected("peer-2");
    await vi.advanceTimersByTimeAsync(61_000);

    expect(lastBroadcastState().phase).toBe("finished");
    expect(lastRecap()?.endedReason).toBe("abandoned");
    expect(lastRecap()?.winnerId).toBeNull();
    session.destroy();
  });

  it("emits a recap before a mid-game rematch wipes the log", async () => {
    const session = makeSession();
    await startDemoGameWith(session, [{ id: "peer-2", name: "Bob" }]);
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await session.handleAction({ type: "reveal-song" }, "host-1");

    await session.handleAction({ type: "rematch" }, "host-1");
    expect(lastRecap()?.endedReason).toBe("abandoned");
    expect(lastRecap()?.rounds).toHaveLength(1);
    // And the next game starts from an empty log
    await session.handleAction(
      { type: "start-game", payload: { playlistUrl: "" } },
      "host-1",
    );
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await session.handleAction({ type: "reveal-song" }, "host-1");
    await finishViaRematch(session);
    expect(lastRecap()!.rounds).toHaveLength(1);
    session.destroy();
  });

  it("keeps the recap out of the game-state broadcasts", async () => {
    const session = makeSession();
    await startDemoGameWith(session, [{ id: "peer-2", name: "Bob" }]);
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    for (const message of sent) {
      if (message.action.type !== "game-state") continue;
      expect("rounds" in (message.action.payload as object)).toBe(false);
    }
    session.destroy();
  });

  it("books the token a skip costs against the player who skipped", async () => {
    const session = makeSession();
    await startDemoGameWith(session, [{ id: "peer-2", name: "Bob" }]);
    await session.handleAction({ type: "skip-song" }, "host-1");

    await finishViaRematch(session);
    const round = lastRecap()!.rounds[0];
    expect(round.tokens).toEqual([
      { playerId: "host-1", playerName: "Alice", delta: -1, reason: "skip" },
    ]);
    session.destroy();
  });

  it("books a buzz against the buzzer and the pass against everyone else", async () => {
    const session = makeSession();
    await startDemoGameWith(session, [
      { id: "peer-2", name: "Bob" },
      { id: "peer-3", name: "Cleo" },
    ]);
    await giveEveryoneACard(session, ["host-1", "peer-2", "peer-3"]);
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await session.handleAction({ type: "bitster-pass" }, "peer-3");
    await session.handleAction({ type: "bitster-buzz" }, "peer-2");
    await session.handleAction(
      { type: "buzz-place", payload: { position: 0 } },
      "peer-2",
    );

    await finishViaRematch(session);
    const round = lastRecap()!.rounds[lastRecap()!.rounds.length - 1]!;
    expect(round.tokens).toEqual([
      { playerId: "peer-2", playerName: "Bob", delta: -1, reason: "buzz" },
    ]);
    expect(round.passes).toEqual([{ playerId: "peer-3", playerName: "Cleo" }]);
    session.destroy();
  });

  it("books the guess reward at the reveal, split by what was guessed", async () => {
    // A fixed track, so the guess can actually be right — the demo playlist
    // picks at random and would make the reward a coin flip
    registerFixedTrackProvider({
      id: "t1",
      uri: "spotify:track:t1",
      name: "Blue Monday",
      artist: "New Order",
      year: 1983,
    });

    const session = makeSession();
    await startPlaylistGame(session);
    const before = lastBroadcastState().players.find((p) => p.id === "host-1")!
      .tokens;

    await session.handleAction(
      {
        type: "guess-song",
        payload: { title: "Blue Monday", artist: "New Order", year: 1983 },
      },
      "host-1",
    );
    // Nothing is awarded before the reveal — the token count would leak it
    expect(
      lastBroadcastState().players.find((p) => p.id === "host-1")?.tokens,
    ).toBe(before);

    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await finishViaRematch(session);

    const round = lastRecap()!.rounds[0];
    expect(round.tokens.map((t) => t.reason)).toEqual([
      "guess-song",
      "guess-year",
    ]);
    expect(round.tokens.every((t) => t.delta === 1 && t.playerId === "host-1")).toBe(
      true,
    );
    expect(round.guess?.tokens).toBe(2);
    session.destroy();
  });

  it("records the slots that were rolled away before the round started", async () => {
    // The first two slots hold nothing playable, the third does
    let call = 0;
    registerTrackProvider(() => {
      call++;
      // null = the provider filtered it out for this account
      if (call <= 2) return null;
      return {
        id: `track-${call}`,
        uri: `spotify:track:${call}`,
        name: "Playable",
        artist: "Someone",
        year: 1999,
      };
    });

    const session = makeSession();
    await startPlaylistGame(session);
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );

    await finishViaRematch(session);
    const round = lastRecap()!.rounds[0];
    expect(round.rerolls).toHaveLength(2);
    expect(round.rerolls.every((r) => r.reason === "unplayable")).toBe(true);
    // Each discarded slot is named, so a dead track stays findable
    expect(new Set(round.rerolls.map((r) => r.index)).size).toBe(2);
    session.destroy();
  });
});

describe("HostSession — game modes", () => {
  /** Push one rule group and start the demo game with it */
  async function startWithRules(
    session: HostSession,
    over: Partial<typeof DEFAULT_RULES>,
    peers: { id: string; name: string }[] = [{ id: "peer-2", name: "Bob" }],
  ): Promise<void> {
    await session.handleAction(
      {
        type: "update-settings",
        payload: { rules: { ...DEFAULT_RULES, ...over } },
      },
      "host-1",
    );
    await startDemoGameWith(session, peers);
  }

  it("refuses a reroll when the mode has them switched off", async () => {
    const session = makeSession();
    await startWithRules(session, { skip: { enabled: false, cost: 1 } });
    const tokensBefore = lastBroadcastState().players.find(
      (p) => p.id === "host-1",
    )!.tokens;

    await session.handleAction({ type: "skip-song" }, "host-1");

    expect(useP2PStore.getState().lastError).toMatch(/reroll/i);
    // Still the same song, still the same tokens
    expect(lastBroadcastState().phase).toBe("playing");
    expect(
      lastBroadcastState().players.find((p) => p.id === "host-1")?.tokens,
    ).toBe(tokensBefore);
    session.destroy();
  });

  it("charges nothing for a free reroll but still swaps the song", async () => {
    const session = makeSession();
    await startWithRules(session, { skip: { enabled: true, cost: 0 } });
    const before = lastBroadcastState();
    const tokensBefore = before.players.find((p) => p.id === "host-1")!.tokens;

    await session.handleAction({ type: "skip-song" }, "host-1");

    const after = lastBroadcastState();
    expect(after.players.find((p) => p.id === "host-1")?.tokens).toBe(
      tokensBefore,
    );
    expect(after.currentSongUri).not.toBe(before.currentSongUri);

    await finishViaRematch(session);
    // A free reroll moves no token, so the log must not invent one
    expect(lastRecap()!.rounds[0].tokens).toEqual([]);
    session.destroy();
  });

  it("skips the bitster window entirely when bitster is off", async () => {
    const session = makeSession();
    await startWithRules(
      session,
      { buzz: { enabled: false, penalty: "none", timerSeconds: 30 } },
      [
        { id: "peer-2", name: "Bob" },
        { id: "peer-3", name: "Cleo" },
      ],
    );
    await giveEveryoneACard(session, ["host-1", "peer-2", "peer-3"]);

    // Second card: with bitster on this would open the window
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    expect(lastBroadcastState().phase).toBe("reveal");
    session.destroy();
  });

  it("deals the mode's starting tokens to everyone", async () => {
    const session = makeSession();
    await startWithRules(session, { tokens: { start: 4 } });
    expect(
      lastBroadcastState().players.every((p) => p.tokens === 4),
    ).toBe(true);
    session.destroy();
  });

  it("pays the easy difficulty for half a guess", async () => {
    registerFixedTrackProvider({
      id: "t1",
      uri: "spotify:track:t1",
      name: "Blue Monday",
      artist: "New Order",
      year: 1983,
    });
    const session = makeSession();
    await session.handleAction(
      {
        type: "update-settings",
        payload: {
          rules: {
            ...DEFAULT_RULES,
            guess: { require: "either", yearBonus: true, yearTolerance: 2 },
          },
        },
      },
      "host-1",
    );
    await startPlaylistGame(session);

    // Artist wrong, title right — worth nothing under "both", a token under "either"
    await session.handleAction(
      {
        type: "guess-song",
        payload: { title: "Blue Monday", artist: "Nobody", year: 1985 },
      },
      "host-1",
    );
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await finishViaRematch(session);

    const round = lastRecap()!.rounds[0];
    // +1 for the song, +1 for a year that is two off but inside the tolerance
    expect(round.guess?.tokens).toBe(2);
    expect(round.tokens.map((t) => t.reason)).toEqual([
      "guess-song",
      "guess-year",
    ]);
    session.destroy();
  });
});

/**
 * A provider that answers every track request from one function. Enough for
 * the host: it only ever asks for a track at an index and for playlist meta.
 */
function registerTrackProvider(next: () => Track | null): void {
  registerProvider({
    id: "spotify",
    name: "Spotify",
    color: "#1DB954",
    icon: "♫",
    auth: {
      login: async () => {},
      logout: async () => {},
      isAuthenticated: () => true,
      refreshToken: async () => {},
    },
    player: {
      play: async () => {},
      pause: async () => {},
      getDevices: async () => [],
      setDevice: async () => {},
    },
    library: {
      getTrackAtIndex: async () => next(),
      parsePlaylistUrl: () => "playlist-1",
      buildPlaylistUrl: (id: string) =>
        `https://open.spotify.com/playlist/${id}`,
      getPlaylistMeta: async () => ({
        id: "playlist-1",
        name: "Test",
        trackCount: 50,
        imageUrl: null,
      }),
    },
  });
  useStreamingStore.getState().setAuthStatus("authenticated");
  useStreamingStore.getState().setActiveProvider("spotify");
}

/** Every round plays the same known track — makes a guess assertable */
function registerFixedTrackProvider(track: Track): void {
  registerTrackProvider(() => track);
}

async function startPlaylistGame(session: HostSession): Promise<void> {
  await session.handleAction(
    { type: "join", payload: { name: "Bob" } },
    "peer-2",
  );
  await session.handleAction(
    {
      type: "start-game",
      payload: { playlistUrl: "https://open.spotify.com/playlist/playlist-1" },
    },
    "host-1",
  );
}

/** Force the game to end so the recap (and with it the log) is emitted */
async function finishViaRematch(session: HostSession): Promise<void> {
  await session.handleAction({ type: "rematch" }, "host-1");
}

describe("HostSession — state stamping", () => {
  it("stamps every broadcast with the host clock", async () => {
    const session = makeSession();
    const before = Date.now();
    await startDemoGameWith(session, [{ id: "peer-2", name: "Bob" }]);
    const state = lastBroadcastState();
    expect(state.hostNow).not.toBeNull();
    expect(state.hostNow!).toBeGreaterThanOrEqual(before);
    expect(state.hostNow!).toBeLessThanOrEqual(Date.now());
    session.destroy();
  });

  it("increases the version strictly, targeted resyncs included", async () => {
    const session = makeSession();
    await startDemoGameWith(session, [{ id: "peer-2", name: "Bob" }]);
    const versions = sent
      .filter((m) => m.action.type === "game-state")
      .map((m) => (m.action.type === "game-state" ? m.action.payload.stateVersion : 0));
    expect(versions.length).toBeGreaterThan(1);
    for (let i = 1; i < versions.length; i++) {
      expect(versions[i]!).toBeGreaterThan(versions[i - 1]!);
    }
    session.destroy();
  });

  it("derives the buzz deadline from the same clock as the stamp", async () => {
    const session = makeSession();
    await startDemoGameWith(session, [
      { id: "peer-2", name: "Bob" },
      { id: "peer-3", name: "Cleo" },
    ]);
    await giveEveryoneACard(session, ["host-1","peer-2","peer-3"]);
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await session.handleAction({ type: "bitster-buzz" }, "peer-2");
    const state = lastBroadcastState();
    const seconds = (state.buzzDeadline! - state.hostNow!) / 1000;
    expect(seconds).toBeGreaterThan(28);
    expect(seconds).toBeLessThanOrEqual(30);
    session.destroy();
  });

  it("derives the blitz deadline from the same clock as the stamp", async () => {
    const session = makeSession();
    await session.handleAction(
      {
        type: "update-settings",
        payload: {
          rules: {
            buzz: { enabled: true, penalty: "none", timerSeconds: 30 },
            placement: { timerSeconds: 20 },

            skip: DEFAULT_RULES.skip,

            guess: DEFAULT_RULES.guess,

            tokens: DEFAULT_RULES.tokens,
          },
        },
      },
      "host-1",
    );
    await startDemoGameWith(session, [{ id: "peer-2", name: "Bob" }]);
    const state = lastBroadcastState();
    const seconds = (state.placeDeadline! - state.hostNow!) / 1000;
    expect(seconds).toBeGreaterThan(18);
    expect(seconds).toBeLessThanOrEqual(20);
    session.destroy();
  });
});

describe("HostSession — reload recovery", () => {
  const EXPECT = { roomCode: "TEST01", hostId: "host-1" };

  it("rebuilds the room, the timelines and the pending verdict", async () => {
    const session = makeSession();
    await startDemoGameWith(session, [
      { id: "peer-2", name: "Bob" },
      { id: "peer-3", name: "Cleo" },
    ]);
    await giveEveryoneACard(session, ["host-1","peer-2","peer-3"]);
    await session.handleAction(
      { type: "guess-song", payload: { title: "Nope", artist: "Nobody" } },
      "host-1",
    );
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    const before = lastBroadcastState();
    const snapshot = session.serialize();
    session.destroy();

    const restored = HostSession.restore(
      (action, target) => sent.push({ action, target }),
      snapshot,
      EXPECT,
    );
    expect(restored).not.toBeNull();
    restored!.broadcastState();

    const after = lastBroadcastState();
    expect(after.phase).toBe("bitster-window");
    expect(after.players.map((p) => p.id)).toEqual(before.players.map((p) => p.id));
    expect(after.timelines["host-1"]?.length).toBe(
      before.timelines["host-1"]?.length,
    );
    // The masked card must still be masked after the round trip
    expect(after.timelines["host-1"]?.some((s) => s.year === 0)).toBe(true);

    // The pending verdict survived: revealing still resolves the round
    await restored!.handleAction({ type: "reveal-song" }, "host-1");
    expect(lastBroadcastState().phase).toBe("reveal");
    restored!.destroy();
  });

  it("issues state versions above the previous session's", async () => {
    vi.useFakeTimers();
    const session = makeSession();
    await startDemoGameWith(session, [{ id: "peer-2", name: "Bob" }]);
    const lastVersion = lastBroadcastState().stateVersion ?? 0;
    const snapshot = session.serialize();
    session.destroy();

    // A host restart takes real time; the seed is the wall clock
    vi.advanceTimersByTime(5_000);
    const restored = HostSession.restore(
      (action, target) => sent.push({ action, target }),
      snapshot,
      EXPECT,
    );
    restored!.broadcastState();
    expect(lastBroadcastState().stateVersion ?? 0).toBeGreaterThan(lastVersion);
    restored!.destroy();
  });

  it("re-arms the buzz timer from the absolute deadline", async () => {
    vi.useFakeTimers();
    const session = makeSession();
    await startDemoGameWith(session, [
      { id: "peer-2", name: "Bob" },
      { id: "peer-3", name: "Cleo" },
    ]);
    await giveEveryoneACard(session, ["host-1","peer-2","peer-3"]);
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await session.handleAction({ type: "bitster-buzz" }, "peer-2");
    expect(lastBroadcastState().buzzDeadline).not.toBeNull();

    const snapshot = session.serialize();
    session.destroy();
    // Ten seconds of the 30 s lock-in pass while the page is gone
    await vi.advanceTimersByTimeAsync(10_000);

    const restored = HostSession.restore(
      (action, target) => sent.push({ action, target }),
      snapshot,
      EXPECT,
    );
    restored!.broadcastState();
    expect(lastBroadcastState().phase).toBe("bitster-window");

    await vi.advanceTimersByTimeAsync(21_000);
    expect(lastBroadcastState().phase).toBe("reveal");
    restored!.destroy();
  });

  it("applies a deadline that expired while the page was gone", async () => {
    vi.useFakeTimers();
    const session = makeSession();
    await startDemoGameWith(session, [
      { id: "peer-2", name: "Bob" },
      { id: "peer-3", name: "Cleo" },
    ]);
    await session.handleAction(
      { type: "place-song", payload: { position: 0 } },
      "host-1",
    );
    await session.handleAction({ type: "bitster-buzz" }, "peer-2");

    const snapshot = session.serialize();
    session.destroy();
    // The whole lock-in elapses before the host comes back
    await vi.advanceTimersByTimeAsync(45_000);

    const restored = HostSession.restore(
      (action, target) => sent.push({ action, target }),
      snapshot,
      EXPECT,
    );
    await vi.advanceTimersByTimeAsync(10);
    expect(lastBroadcastState().phase).toBe("reveal");
    restored!.destroy();
  });

  it("refuses a snapshot from a foreign room, host or schema version", async () => {
    const session = makeSession();
    await startDemoGameWith(session, [{ id: "peer-2", name: "Bob" }]);
    const snapshot = session.serialize();
    session.destroy();
    const send = () => {};

    expect(
      HostSession.restore(send, snapshot, {
        roomCode: "OTHER1",
        hostId: "host-1",
      }),
    ).toBeNull();
    expect(
      HostSession.restore(send, snapshot, {
        roomCode: "TEST01",
        hostId: "someone-else",
      }),
    ).toBeNull();
    expect(
      HostSession.restore(send, { ...snapshot, v: 2 as 1 }, EXPECT),
    ).toBeNull();
    expect(
      HostSession.restore(
        send,
        { ...snapshot, savedAt: Date.now() - 31 * 60_000 },
        EXPECT,
      ),
    ).toBeNull();
  });

  it("marks players missing from the relay member list offline", async () => {
    vi.useFakeTimers();
    const session = makeSession();
    await startDemoGameWith(session, [
      { id: "peer-2", name: "Bob" },
      { id: "peer-3", name: "Cleo" },
    ]);

    session.reconcileMembers(["host-1", "peer-2"]);
    session.broadcastState();
    const state = lastBroadcastState();
    expect(state.players.find((p) => p.id === "peer-2")?.connected).toBe(true);
    expect(state.players.find((p) => p.id === "peer-3")?.connected).toBe(false);

    await vi.advanceTimersByTimeAsync(61_000);
    expect(
      lastBroadcastState().players.find((p) => p.id === "peer-3"),
    ).toBeUndefined();
    session.destroy();
  });

  it("changes nothing when the relay sends no member list", async () => {
    const session = makeSession();
    await startDemoGameWith(session, [
      { id: "peer-2", name: "Bob" },
      { id: "peer-3", name: "Cleo" },
    ]);
    session.reconcileMembers(undefined);
    session.reconcileMembers([]);
    session.broadcastState();
    expect(lastBroadcastState().players.every((p) => p.connected)).toBe(true);
    session.destroy();
  });

  it("brings a player back online when they reappear in the member list", async () => {
    vi.useFakeTimers();
    const session = makeSession();
    await startDemoGameWith(session, [
      { id: "peer-2", name: "Bob" },
      { id: "peer-3", name: "Cleo" },
    ]);
    session.handlePeerDisconnected("peer-3");
    expect(
      lastBroadcastState().players.find((p) => p.id === "peer-3")?.connected,
    ).toBe(false);

    session.reconcileMembers(["host-1", "peer-2", "peer-3"]);
    session.broadcastState();
    expect(
      lastBroadcastState().players.find((p) => p.id === "peer-3")?.connected,
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(
      lastBroadcastState().players.find((p) => p.id === "peer-3"),
    ).toBeDefined();
    session.destroy();
  });
});
