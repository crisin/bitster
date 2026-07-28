import { beforeEach, describe, expect, it, vi } from "vitest";

// session.ts → logger → expo/react-native modules that don't parse in node
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

import { addPlayer, createRoom, startGame } from "@/game/logic";
import type { Room } from "@/game/types";
import type { HostSnapshot, P2PSession, SessionStorage } from "./session";
import {
  clearHostSnapshot,
  clearSession,
  configureSessionStorage,
  flushSync,
  loadHostSnapshot,
  loadSession,
  persistSnapshotThrottled,
  saveHostSnapshot,
  saveSession,
  SESSION_TTL_MS,
} from "./session";

/** Stand-in for localStorage / AsyncStorage — vitest runs without either */
function memoryStorage(opts?: { throwOnWrite?: boolean }): SessionStorage & {
  data: Map<string, string>;
} {
  const data = new Map<string, string>();
  return {
    data,
    async get(key) {
      return data.get(key) ?? null;
    },
    async set(key, value) {
      if (opts?.throwOnWrite) throw new Error("QuotaExceededError");
      data.set(key, value);
    },
    async remove(key) {
      data.delete(key);
    },
    setSync(key, value) {
      if (opts?.throwOnWrite) throw new Error("QuotaExceededError");
      data.set(key, value);
      return true;
    },
  };
}

function makeRoom(): Room {
  let room = createRoom("TEST01", "host-1", "Alice");
  room = addPlayer(room, "peer-2", "Bob");
  return startGame(room, [], "Demo");
}

function makeSnapshot(room: Room = makeRoom()): HostSnapshot {
  return {
    v: 1,
    roomCode: room.code,
    hostId: room.hostId,
    savedAt: Date.now(),
    room,
    pendingResult: null,
    pendingGuessResult: null,
    pendingGuessBy: null,
    pendingBuzzPosition: null,
    pendingPosition: null,
    pendingGuessText: null,
    gameStartedAt: 0,
    roundStartedAt: 0,
    roundRecorded: true,
    recapSent: false,
  };
}

const SESSION: P2PSession = {
  v: 1,
  role: "host",
  roomCode: "TEST01",
  myId: "abc123",
  token: "s3cr3t",
  name: "Alice",
  hostPeerId: "abc123",
  savedAt: 0,
};

let store: ReturnType<typeof memoryStorage>;

beforeEach(async () => {
  store = memoryStorage();
  configureSessionStorage(store);
  await clearHostSnapshot();
});

describe("session persistence", () => {
  it("round-trips a session", async () => {
    await saveSession({ ...SESSION, savedAt: Date.now() });
    const loaded = await loadSession();
    expect(loaded?.myId).toBe("abc123");
    expect(loaded?.token).toBe("s3cr3t");
    expect(loaded?.role).toBe("host");
  });

  it("rejects and clears a session past its TTL", async () => {
    await saveSession({ ...SESSION, savedAt: Date.now() - SESSION_TTL_MS - 1 });
    expect(await loadSession()).toBeNull();
    expect(store.data.size).toBe(0);
  });

  it("rejects a session from an older schema version", async () => {
    store.data.set(
      "bitster.p2p.session",
      JSON.stringify({ ...SESSION, v: 0, savedAt: Date.now() }),
    );
    expect(await loadSession()).toBeNull();
  });

  it("rejects a session without a token", async () => {
    const { token, ...rest } = SESSION;
    void token;
    store.data.set(
      "bitster.p2p.session",
      JSON.stringify({ ...rest, savedAt: Date.now() }),
    );
    expect(await loadSession()).toBeNull();
  });

  it("survives unparseable JSON", async () => {
    store.data.set("bitster.p2p.session", "{ not json");
    expect(await loadSession()).toBeNull();
  });

  it("does not throw when the storage backend refuses to write", async () => {
    configureSessionStorage(memoryStorage({ throwOnWrite: true }));
    await expect(
      saveSession({ ...SESSION, savedAt: Date.now() }),
    ).resolves.toBeUndefined();
    await clearSession();
  });
});

describe("host snapshot persistence", () => {
  it("round-trips a snapshot with its full room", async () => {
    const snapshot = makeSnapshot();
    await saveHostSnapshot(snapshot);
    const loaded = await loadHostSnapshot();
    expect(loaded?.room.code).toBe("TEST01");
    expect(loaded?.room.players.map((p) => p.id)).toEqual(["host-1", "peer-2"]);
    expect(loaded?.room.phase).toBe("playing");
  });

  it("keeps unmasked years — a snapshot legitimately holds the answers", async () => {
    const room = makeRoom();
    const withSong: Room = {
      ...room,
      currentSong: {
        id: "s1",
        uri: "spotify:track:1",
        name: "Song",
        artist: "Artist",
        year: 1975,
        albumName: "Album",
        popularity: 42,
      },
    };
    await saveHostSnapshot(makeSnapshot(withSong));
    const loaded = await loadHostSnapshot();
    expect(loaded?.room.currentSong?.year).toBe(1975);
    expect(loaded?.room.currentSong?.albumName).toBe("Album");
  });

  it("rejects and clears a snapshot whose room is corrupt", async () => {
    const snapshot = makeSnapshot();
    store.data.set(
      "bitster.p2p.hostRoom",
      JSON.stringify({ ...snapshot, room: { code: "TEST01" } }),
    );
    expect(await loadHostSnapshot()).toBeNull();
    expect(store.data.has("bitster.p2p.hostRoom")).toBe(false);
  });

  it("rejects a snapshot past its TTL", async () => {
    await saveHostSnapshot({
      ...makeSnapshot(),
      savedAt: Date.now() - SESSION_TTL_MS - 1,
    });
    expect(await loadHostSnapshot()).toBeNull();
  });

  it("coalesces throttled writes and skips byte-identical ones", async () => {
    vi.useFakeTimers();
    const snapshot = makeSnapshot();
    persistSnapshotThrottled(snapshot);
    persistSnapshotThrottled(snapshot);
    persistSnapshotThrottled(snapshot);
    expect(store.data.has("bitster.p2p.hostRoom")).toBe(false);

    await vi.advanceTimersByTimeAsync(2_500);
    expect(store.data.has("bitster.p2p.hostRoom")).toBe(true);
    vi.useRealTimers();
  });

  it("flushes a pending snapshot synchronously", () => {
    vi.useFakeTimers();
    persistSnapshotThrottled(makeSnapshot());
    expect(store.data.has("bitster.p2p.hostRoom")).toBe(false);

    flushSync();
    expect(store.data.has("bitster.p2p.hostRoom")).toBe(true);
    vi.useRealTimers();
  });
});
