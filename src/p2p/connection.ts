import { AppState } from "react-native";
import { validateAction } from "./protocol";
import type { P2PAction } from "./protocol";
import { HostSession } from "./host";
import * as peer from "./peer";
import {
  clearHostSnapshot,
  clearSession,
  flushSync,
  loadHostSnapshot,
  loadSession,
  saveSession,
} from "./session";
import { useGameStore } from "@/game/store";
import { useP2PStore } from "./store";
import { log as logger } from "@/utils/logger";
import { MAX_RECONNECT_ATTEMPTS, RECONNECT_INTERVAL_MS } from "@/utils/constants";

const JOIN_TIMEOUT_MS = 12_000;
const JOIN_RETRY_MS = 3_000;
const MAX_JOIN_RETRIES = 3;
const MAX_RECONNECT_DELAY_MS = 10_000;

type Role = "host" | "peer";

/** Envelope protocol between client and the relay server (see server.js). */
type ServerMsg =
  | { t: "created"; id: string; token: string; room: string }
  | {
      t: "joined";
      id: string;
      token: string;
      room: string;
      hostId: string;
      members?: string[];
    }
  | { t: "msg"; from: string; data: unknown }
  | { t: "peer-joined"; id: string }
  | { t: "peer-left"; id: string }
  | { t: "host-down" }
  | { t: "host-up" }
  | { t: "room-closed" }
  | { t: "err"; code: string };

type ClientMsg =
  | { t: "create"; room: string }
  | { t: "join"; room: string }
  | { t: "rejoin"; room: string; id: string; token: string }
  | { t: "msg"; to: "all" | "host" | string; data: P2PAction }
  | { t: "leave" };

let socket: WebSocket | null = null;
let role: Role | null = null;
let roomCode = "";
let myName = "";
let myId: string | null = null;
/** Proves our membership to the relay on rejoin — never leaves this device */
let myToken: string | null = null;
let hostPeerId: string | null = null;
let hostSession: HostSession | null = null;
let reconnectAttempts = 0;
let joinTimeout: ReturnType<typeof setTimeout> | null = null;
let joinRetryTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let appStateSub: { remove: () => void } | null = null;

function getRelayUrl(): string | null {
  const env = process.env.EXPO_PUBLIC_RELAY_URL;
  if (env) return env;
  if (typeof window !== "undefined" && window.location?.host) {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws`;
  }
  return null;
}

// -- Public API --

export function createRoom(code: string, playerName: string): void {
  cleanup();
  role = "host";
  roomCode = code;
  myName = playerName;
  // A brand-new room must never inherit the previous one's state
  void clearSession();
  void clearHostSnapshot();

  useP2PStore.getState().setStatus("connecting");
  useP2PStore.getState().setLastError(null);

  openSocket({ t: "create", room: code });
  armJoinTimeout("Could not reach the game server.");
  logger.info("p2p", `Creating room ${code} as host`);
}

export function joinRoom(code: string, playerName: string): void {
  cleanup();
  role = "peer";
  roomCode = code;
  myName = playerName;

  useP2PStore.getState().setStatus("connecting");
  useP2PStore.getState().setLastError(null);

  openSocket({ t: "join", room: code });
  armJoinTimeout("Could not join the room. Check the code and try again.");
  logger.info("p2p", `Joining room ${code} as peer`);
}

export function rejoinRoom(code: string, playerName: string): void {
  logger.info("p2p", `Retrying connection for room ${code}`);
  if (myId && myToken && roomCode === code && role) {
    // Resume our own membership instead of asking for a brand-new seat —
    // for a host that would collide with their own room, and for a peer it
    // would be refused by a game that is already running.
    reconnectAttempts = 0;
    useP2PStore.getState().setStatus("connecting");
    useP2PStore.getState().setLastError(null);
    useP2PStore.getState().setResuming("self");
    openSocket({ t: "rejoin", room: code, id: myId, token: myToken });
    armJoinTimeout("Could not reach the game server.");
    return;
  }
  joinRoom(code, playerName);
}

/**
 * Come back after a reload. Everything the transport needs lives in module
 * state, which the page took with it — so it is restored from storage, and a
 * host additionally rebuilds its whole game from the last snapshot.
 *
 * Returns false when there is nothing usable to resume (the caller already
 * has an error on screen by then).
 */
export async function resume(p: {
  code: string;
  name: string;
  isHost: boolean;
}): Promise<boolean> {
  const stored = await loadSession();
  if (!stored || stored.roomCode !== p.code || (stored.role === "host") !== p.isHost) {
    if (p.isHost) {
      // Never fall back to createRoom: it would either collide with the live
      // room or plant an empty one under a code peers are still sitting in.
      await clearSession();
      await clearHostSnapshot();
      fail("That game session expired — start a new room.", { terminal: true });
      return false;
    }
    // A peer with a new id can only be seated while the game is still in the
    // lobby; mid-game the host would refuse them anyway.
    if (useGameStore.getState().phase !== "lobby") {
      await clearSession();
      fail("That game session expired — ask the host for a fresh room.", {
        terminal: true,
      });
      return false;
    }
    joinRoom(p.code, p.name);
    return true;
  }

  cleanup();
  role = stored.role;
  roomCode = stored.roomCode;
  myName = stored.name || p.name;
  myId = stored.myId;
  myToken = stored.token;
  hostPeerId = stored.hostPeerId;

  useP2PStore.getState().setMyPeerId(myId);
  useP2PStore.getState().setStatus("connecting");
  useP2PStore.getState().setLastError(null);
  useP2PStore.getState().setResuming("self");

  if (role === "host") {
    const snapshot = await loadHostSnapshot();
    const restored = snapshot
      ? HostSession.restore(sendToAll, snapshot, {
          roomCode: stored.roomCode,
          hostId: stored.myId,
        })
      : null;
    if (!restored) {
      await clearSession();
      await clearHostSnapshot();
      fail("That game session expired — start a new room.", { terminal: true });
      return false;
    }
    hostSession = restored;
    // Paint the restored game locally before the socket is even open
    hostSession.broadcastState();
    logger.info("p2p", `Restored host session for room ${roomCode}`);
  } else {
    peer.resetPeerState();
  }

  openSocket({ t: "rejoin", room: roomCode, id: myId, token: myToken });
  armJoinTimeout("Could not reach the game server.");
  return true;
}

/**
 * Sends an action to the host session (or relays it there as a peer).
 * `opts.as` lets the HOST device act on behalf of one of its local
 * pass-and-play players — it never leaves the device, so remote peers
 * cannot impersonate anyone (their sender id comes from the relay).
 */
export function dispatch(action: P2PAction, opts?: { as?: string }): void {
  if (!role || !myId) {
    logger.warn("p2p", "dispatch called but not connected");
    return;
  }

  logger.debug("p2p", `dispatch → ${action.type} (role=${role})`);

  if (role === "host") {
    void hostSession?.handleAction(action, opts?.as ?? myId);
  } else {
    sendEnvelope({ t: "msg", to: "host", data: action });
  }
}

export function leave(): void {
  sendEnvelope({ t: "leave" });
  cleanup();
  // Leaving on purpose is the one path that must NOT be resumable
  void clearSession();
  void clearHostSnapshot();
  useP2PStore.getState().reset();
  useGameStore.getState().reset();
  logger.info("p2p", "Left room");
}

// -- Transport --

function openSocket(hello: ClientMsg): void {
  const url = getRelayUrl();
  if (!url) {
    fail("Game server address is not configured (EXPO_PUBLIC_RELAY_URL).");
    return;
  }

  const prev = socket;
  socket = null;
  prev?.close();

  const s = new WebSocket(url);
  socket = s;

  // pagehide only: it fires when the page actually unloads. beforeunload would
  // fire even when the user CANCELS the leave-confirmation dialog — and would
  // kick them out of the room despite staying on the page.
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", handleUnload);
    window.addEventListener("pageshow", handlePageShow);
  }
  ensureAppStateListener();

  s.onopen = () => {
    if (s !== socket) return;
    s.send(JSON.stringify(hello));
  };

  s.onmessage = (event: MessageEvent) => {
    if (s !== socket) return;
    let msg: ServerMsg;
    try {
      msg = JSON.parse(String(event.data)) as ServerMsg;
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== "string") return;
    handleServerMsg(msg);
  };

  s.onclose = () => {
    if (s !== socket) return;
    socket = null;
    handleDisconnect();
  };

  s.onerror = () => {
    // onclose fires afterwards and handles recovery
  };
}

function sendEnvelope(msg: ClientMsg): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

function sendToAll(action: P2PAction, target?: string): void {
  sendEnvelope({ t: "msg", to: target ?? "all", data: action });
}

function peerContext(): peer.PeerContext {
  return {
    myId,
    onInitialState: clearJoinTimers,
    onFatalError: fail,
  };
}

function handleServerMsg(msg: ServerMsg): void {
  switch (msg.t) {
    case "created": {
      myId = msg.id;
      myToken = msg.token;
      reconnectAttempts = 0;
      hostSession = new HostSession(sendToAll, roomCode, msg.id, myName);
      useP2PStore.getState().setMyPeerId(msg.id);
      useP2PStore.getState().setReconnectAttempts(0);
      clearJoinTimers();
      useP2PStore.getState().setStatus("connected");
      useP2PStore.getState().setResuming(null);
      void persistSession();
      hostSession.broadcastState();
      logger.info("p2p", `Room ${roomCode} created, my id ${msg.id.slice(0, 8)}`);
      break;
    }

    case "joined": {
      myId = msg.id;
      myToken = msg.token;
      hostPeerId = msg.hostId;
      reconnectAttempts = 0;
      useP2PStore.getState().setMyPeerId(msg.id);
      useP2PStore.getState().setReconnectAttempts(0);
      void persistSession();

      if (role === "host") {
        // Resumed our own room after a reconnect or a reload
        clearJoinTimers();
        useP2PStore.getState().setStatus("connected");
        useP2PStore.getState().setResuming(null);
        hostSession?.reconcileMembers(msg.members);
        hostSession?.broadcastState();
        logger.info("p2p", "Resumed room as host");
      } else {
        // Server confirmed the room exists — now ask the host to add us.
        // Status flips to "connected" when the first game-state arrives.
        peer.resetPeerState();
        sendJoinAction();
        scheduleJoinRetry(1);
        logger.info("p2p", `In room ${msg.room}, waiting for host ${msg.hostId.slice(0, 8)}`);
      }
      break;
    }

    case "msg": {
      const action = validateAction(msg.data);
      if (!action) {
        logger.warn("p2p", `Rejected invalid message from ${msg.from.slice(0, 8)}`);
        return;
      }
      logger.debug("p2p", `← ${action.type} from ${msg.from.slice(0, 8)}`);

      if (role === "host") {
        void hostSession?.handleAction(action, msg.from);
      } else {
        if (msg.from !== hostPeerId) {
          logger.warn("p2p", `Ignoring ${action.type} from non-host ${msg.from.slice(0, 8)}`);
          return;
        }
        peer.handleHostMessage(action, peerContext());
      }
      break;
    }

    case "peer-joined": {
      if (role !== "host") return;
      logger.info("p2p", `Peer connected: ${msg.id.slice(0, 8)}`);
      hostSession?.handlePeerConnected(msg.id);
      break;
    }

    case "peer-left": {
      if (role !== "host") return;
      logger.info("p2p", `Peer disconnected: ${msg.id.slice(0, 8)}`);
      // The host session owns the peer list now — a dropped socket starts a
      // grace period, it does not remove the player.
      hostSession?.handlePeerDisconnected(msg.id);
      break;
    }

    case "host-down": {
      if (role !== "peer") return;
      logger.warn("p2p", "Host connection lost, waiting for host to return");
      useP2PStore.getState().setStatus("connecting");
      useP2PStore.getState().setResuming("host");
      break;
    }

    case "host-up": {
      if (role !== "peer") return;
      logger.info("p2p", "Host is back");
      // Host re-broadcasts state on resume, which flips status to connected
      break;
    }

    case "room-closed": {
      // Distinguish "they hung up" from "they never came back" — the second is
      // what a host whose reload failed looks like from here.
      const hostWasDown = useP2PStore.getState().resuming === "host";
      void clearSession();
      void clearHostSnapshot();
      fail(
        hostWasDown
          ? "The host didn't come back — the game is over."
          : "The host closed the room.",
        { terminal: true },
      );
      break;
    }

    case "err": {
      handleServerError(msg.code);
      break;
    }
  }
}

function handleServerError(code: string): void {
  switch (code) {
    case "room-not-found":
      void clearSession();
      void clearHostSnapshot();
      fail(
        myId
          ? "The room no longer exists."
          : "Room not found. Check the code — the host must have the lobby open.",
        { terminal: true },
      );
      break;
    case "room-exists":
      void clearSession();
      void clearHostSnapshot();
      fail("Room code already taken — go back and create a new room.", {
        terminal: true,
      });
      break;
    case "bad-session":
      // Our stored membership is not the one the relay is holding
      void clearSession();
      void clearHostSnapshot();
      fail("That game session expired — start a new room.", { terminal: true });
      break;
    default:
      fail("Connection error. Please try again.");
      break;
  }
  logger.warn("p2p", `Server error: ${code}`);
}

// -- Reconnect --

function handleDisconnect(): void {
  if (!role) return;

  if (!myId || !myToken) {
    // Never made it into a room — no point retrying automatically
    fail("Could not reach the game server.");
    return;
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    fail("Lost connection to the server.");
    return;
  }

  reconnectAttempts++;
  useP2PStore.getState().setReconnectAttempts(reconnectAttempts);
  useP2PStore.getState().setStatus("connecting");
  useP2PStore.getState().setResuming("self");
  logger.warn(
    "p2p",
    `Connection lost, reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
  );

  const delay = Math.min(RECONNECT_INTERVAL_MS * reconnectAttempts, MAX_RECONNECT_DELAY_MS);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    if (!role || !myId || !myToken) return;
    openSocket({ t: "rejoin", room: roomCode, id: myId, token: myToken });
  }, delay);
}

/** Reconnect right now if the socket died while we were away */
function resumeIfDead(): void {
  if (!role || !myId || !myToken) return;
  if (socket && socket.readyState === WebSocket.OPEN) return;
  logger.info("p2p", "Resumed with a dead connection — rejoining");
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  useP2PStore.getState().setStatus("connecting");
  useP2PStore.getState().setResuming("self");
  openSocket({ t: "rejoin", room: roomCode, id: myId, token: myToken });
}

/**
 * Screen lock or app switch can kill the socket without a timely onclose.
 * When the app comes back to the foreground with a dead socket, rejoin
 * immediately instead of waiting for timeouts.
 */
function ensureAppStateListener(): void {
  if (appStateSub) return;
  appStateSub = AppState.addEventListener("change", (state) => {
    if (state !== "active") return;
    resumeIfDead();
  });
}

// -- Join handshake (peer) --

function sendJoinAction(): void {
  sendEnvelope({ t: "msg", to: "host", data: { type: "join", payload: { name: myName } } });
}

function scheduleJoinRetry(attempt: number): void {
  if (joinRetryTimer) clearTimeout(joinRetryTimer);
  joinRetryTimer = setTimeout(() => {
    if (role !== "peer" || peer.hasReceivedState()) return;
    if (attempt > MAX_JOIN_RETRIES) return; // the join timeout handles the failure
    logger.info("p2p", `Re-sending join (attempt ${attempt}/${MAX_JOIN_RETRIES})`);
    sendJoinAction();
    scheduleJoinRetry(attempt + 1);
  }, JOIN_RETRY_MS);
}

function armJoinTimeout(message: string): void {
  if (joinTimeout) clearTimeout(joinTimeout);
  joinTimeout = setTimeout(() => {
    if (useP2PStore.getState().status === "connecting") {
      fail(message);
      logger.warn("p2p", `Connection timeout for room ${roomCode}`);
    }
  }, JOIN_TIMEOUT_MS);
}

function fail(message: string, opts?: { terminal?: boolean }): void {
  clearJoinTimers();
  useP2PStore.getState().setStatus("error");
  useP2PStore.getState().setResuming(null);
  useP2PStore.getState().setLastError(message, opts?.terminal === true);
}

/** Store what a reload needs to find its way back into this room */
async function persistSession(): Promise<void> {
  if (!role || !myId || !myToken) return;
  await saveSession({
    v: 1,
    role,
    roomCode,
    myId,
    token: myToken,
    name: myName,
    hostPeerId,
    savedAt: Date.now(),
  });
}

function clearJoinTimers(): void {
  if (joinTimeout) {
    clearTimeout(joinTimeout);
    joinTimeout = null;
  }
  if (joinRetryTimer) {
    clearTimeout(joinRetryTimer);
    joinRetryTimer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/**
 * The page is going away — possibly for good, possibly for a reload or an iOS
 * tab switch. Deliberately no `{t:"leave"}`: for a host the relay would close
 * the room instantly, which is exactly what makes a reload unrecoverable. The
 * relay's grace period covers the difference, and `cleanup()` would destroy the
 * host session before its state could be written.
 */
function handleUnload(): void {
  flushSync();
}

/** Restored from the bfcache (iOS tab switch) — the socket rarely survives */
function handlePageShow(event: PageTransitionEvent): void {
  if (event.persisted) resumeIfDead();
}

function cleanup(): void {
  clearJoinTimers();
  if (typeof window !== "undefined") {
    window.removeEventListener("pagehide", handleUnload);
    window.removeEventListener("pageshow", handlePageShow);
  }
  appStateSub?.remove();
  appStateSub = null;
  const s = socket;
  socket = null;
  s?.close();
  hostSession?.destroy();
  hostSession = null;
  role = null;
  roomCode = "";
  myName = "";
  myId = null;
  myToken = null;
  hostPeerId = null;
  reconnectAttempts = 0;
  peer.resetPeerState();
}
