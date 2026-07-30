import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  GuessResult,
  PlacementResult,
  Room,
  RoundReroll,
  RoundToken,
} from "@/game/types";
import { log as logger } from "@/utils/logger";
import { validateRoom } from "./protocol";

/**
 * What a reload has to remember to get back into the room. The relay hands out
 * peer ids, so without this a reloaded page can only ever join as a NEW player —
 * which an in-progress game refuses.
 */
export interface P2PSession {
  v: 1;
  role: "host" | "peer";
  roomCode: string;
  myId: string;
  /** Proves to the relay that this id is ours (see server.js `rejoin`) */
  token: string;
  name: string;
  hostPeerId: string | null;
  savedAt: number;
}

/**
 * The host's authoritative game state, so a reloaded host can carry on instead
 * of taking the room down with them. Timers are NOT stored: they are re-armed
 * from the absolute deadlines inside `room`.
 */
export interface HostSnapshot {
  v: 1;
  roomCode: string;
  hostId: string;
  savedAt: number;
  room: Room;
  pendingResult: PlacementResult | null;
  pendingGuessResult: GuessResult | null;
  pendingGuessBy: string | null;
  pendingBuzzPosition: number | null;
  pendingPosition: number | null;
  pendingGuessText: {
    title: string;
    artist: string;
    year: number | null;
  } | null;
  gameStartedAt: number;
  roundStartedAt: number;
  roundRecorded: boolean;
  recapSent: boolean;
  /**
   * Round-log events collected so far. Optional because a snapshot written
   * before they existed is still perfectly restorable — the reloaded host just
   * starts that round's event list empty rather than refusing the whole room.
   */
  pendingTokens?: RoundToken[];
  pendingRerolls?: RoundReroll[];
}

const SESSION_KEY = "bitster.p2p.session";
const SNAPSHOT_KEY = "bitster.p2p.hostRoom";

/** Older than this and we do not even try — the relay would have dropped it */
export const SESSION_TTL_MS = 30 * 60_000;
/** Snapshots are written from broadcastState, which fires several times a round */
const PERSIST_THROTTLE_MS = 2_000;

// -- Storage backend --------------------------------------------------------
// Web uses localStorage because it is SYNCHRONOUS, which is the only reason a
// write on `pagehide` can still land. Native has no pagehide (the AppState
// background transition provides the window) and uses AsyncStorage.

export interface SessionStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** Only web can honour this; native returns false and relies on the async path */
  setSync(key: string, value: string): boolean;
}

function webStorage(): SessionStorage | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const ls = window.localStorage;
  return {
    async get(key) {
      return ls.getItem(key);
    },
    async set(key, value) {
      ls.setItem(key, value);
    },
    async remove(key) {
      ls.removeItem(key);
    },
    setSync(key, value) {
      ls.setItem(key, value);
      return true;
    },
  };
}

const nativeStorage: SessionStorage = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
  setSync: () => false,
};

let storage: SessionStorage = webStorage() ?? nativeStorage;

/**
 * Swap the storage backend. Exists for tests (vitest runs in the node
 * environment, so neither real backend is reachable) and for any platform that
 * needs its own.
 */
export function configureSessionStorage(next: SessionStorage): void {
  storage = next;
}

/** Every write is best-effort: Safari private mode throws on setItem. */
async function write(key: string, value: string): Promise<void> {
  try {
    await storage.set(key, value);
  } catch (err) {
    logger.warn("p2p", `Could not persist ${key}: ${err}`);
  }
}

async function read(key: string): Promise<string | null> {
  try {
    return await storage.get(key);
  } catch (err) {
    logger.warn("p2p", `Could not read ${key}: ${err}`);
    return null;
  }
}

async function drop(key: string): Promise<void> {
  try {
    await storage.remove(key);
  } catch {
    // Nothing useful to do — the value is stale either way
  }
}

// -- Session ----------------------------------------------------------------

export async function saveSession(session: P2PSession): Promise<void> {
  await write(SESSION_KEY, JSON.stringify(session));
}

export async function loadSession(): Promise<P2PSession | null> {
  const raw = await read(SESSION_KEY);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await drop(SESSION_KEY);
    return null;
  }
  const session = parseSession(parsed);
  if (!session) {
    await drop(SESSION_KEY);
    return null;
  }
  if (Date.now() - session.savedAt > SESSION_TTL_MS) {
    await drop(SESSION_KEY);
    return null;
  }
  return session;
}

export async function clearSession(): Promise<void> {
  await drop(SESSION_KEY);
}

function parseSession(v: unknown): P2PSession | null {
  if (typeof v !== "object" || v === null) return null;
  const s = v as Record<string, unknown>;
  if (s.v !== 1) return null;
  if (s.role !== "host" && s.role !== "peer") return null;
  if (typeof s.roomCode !== "string" || s.roomCode.length === 0) return null;
  if (typeof s.myId !== "string" || s.myId.length === 0) return null;
  if (typeof s.token !== "string" || s.token.length === 0) return null;
  if (typeof s.name !== "string") return null;
  if (s.hostPeerId !== null && typeof s.hostPeerId !== "string") return null;
  if (typeof s.savedAt !== "number" || !Number.isFinite(s.savedAt)) return null;
  return {
    v: 1,
    role: s.role,
    roomCode: s.roomCode,
    myId: s.myId,
    token: s.token,
    name: s.name,
    hostPeerId: s.hostPeerId,
    savedAt: s.savedAt,
  };
}

// -- Host snapshot ----------------------------------------------------------

let pendingSnapshot: HostSnapshot | null = null;
let lastSnapshotJson = "";
let throttleTimer: ReturnType<typeof setTimeout> | null = null;

export async function saveHostSnapshot(snapshot: HostSnapshot): Promise<void> {
  await write(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

/**
 * The dedupe key: the snapshot with its timestamp neutralized. Comparing the
 * raw JSON was dead code — serialize() stamps savedAt with Date.now(), so no
 * two snapshots were EVER byte-identical and every throttle tick wrote the
 * full room to storage even when nothing had changed.
 */
function contentKeyOf(snapshot: HostSnapshot): string {
  return JSON.stringify({ ...snapshot, savedAt: 0 });
}

/**
 * Called from every broadcast, so it coalesces: at most one write per
 * PERSIST_THROTTLE_MS, and content-identical states are skipped entirely.
 */
export function persistSnapshotThrottled(snapshot: HostSnapshot): void {
  pendingSnapshot = snapshot;
  if (throttleTimer) return;
  throttleTimer = setTimeout(() => {
    throttleTimer = null;
    const snap = pendingSnapshot;
    pendingSnapshot = null;
    if (!snap) return;
    const key = contentKeyOf(snap);
    if (key === lastSnapshotJson) return;
    lastSnapshotJson = key;
    void write(SNAPSHOT_KEY, JSON.stringify(snap));
  }, PERSIST_THROTTLE_MS);
}

/**
 * Write whatever is still pending, right now. Web only — this is what makes a
 * snapshot survive `pagehide`, where an async write would never land.
 */
export function flushSync(): void {
  const snap = pendingSnapshot;
  if (!snap) return;
  pendingSnapshot = null;
  if (throttleTimer) {
    clearTimeout(throttleTimer);
    throttleTimer = null;
  }
  try {
    const key = contentKeyOf(snap);
    if (key === lastSnapshotJson) return;
    if (storage.setSync(SNAPSHOT_KEY, JSON.stringify(snap))) {
      lastSnapshotJson = key;
    }
  } catch (err) {
    logger.warn("p2p", `Could not flush the host snapshot: ${err}`);
  }
}

export async function loadHostSnapshot(): Promise<HostSnapshot | null> {
  const raw = await read(SNAPSHOT_KEY);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await drop(SNAPSHOT_KEY);
    return null;
  }
  const snapshot = parseSnapshot(parsed);
  if (!snapshot || Date.now() - snapshot.savedAt > SESSION_TTL_MS) {
    await drop(SNAPSHOT_KEY);
    return null;
  }
  return snapshot;
}

export async function clearHostSnapshot(): Promise<void> {
  pendingSnapshot = null;
  lastSnapshotJson = "";
  if (throttleTimer) {
    clearTimeout(throttleTimer);
    throttleTimer = null;
  }
  await drop(SNAPSHOT_KEY);
}

function parseSnapshot(v: unknown): HostSnapshot | null {
  if (typeof v !== "object" || v === null) return null;
  const s = v as Record<string, unknown>;
  if (s.v !== 1) return null;
  if (typeof s.roomCode !== "string" || typeof s.hostId !== "string")
    return null;
  if (typeof s.savedAt !== "number" || !Number.isFinite(s.savedAt)) return null;

  // The room is the only part big enough to be worth validating structurally;
  // a corrupt one would poison the whole session.
  const room = validateRoom(s.room);
  if (!room) return null;

  return {
    v: 1,
    roomCode: s.roomCode,
    hostId: s.hostId,
    savedAt: s.savedAt,
    room,
    pendingResult: (s.pendingResult ?? null) as PlacementResult | null,
    pendingGuessResult: (s.pendingGuessResult ?? null) as GuessResult | null,
    pendingGuessBy: (s.pendingGuessBy ?? null) as string | null,
    pendingBuzzPosition: (s.pendingBuzzPosition ?? null) as number | null,
    pendingPosition: (s.pendingPosition ?? null) as number | null,
    pendingGuessText: (s.pendingGuessText ?? null) as HostSnapshot["pendingGuessText"],
    gameStartedAt: typeof s.gameStartedAt === "number" ? s.gameStartedAt : 0,
    roundStartedAt: typeof s.roundStartedAt === "number" ? s.roundStartedAt : 0,
    roundRecorded: s.roundRecorded !== false,
    recapSent: s.recapSent === true,
  };
}
