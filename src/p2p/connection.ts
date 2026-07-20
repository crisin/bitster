import { AppState } from "react-native";
import { validateAction } from "./protocol";
import type { P2PAction } from "./protocol";
import { HostSession } from "./host";
import * as peer from "./peer";
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
  | { t: "created"; id: string; room: string }
  | { t: "joined"; id: string; room: string; hostId: string }
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
  | { t: "rejoin"; room: string; id: string }
  | { t: "msg"; to: "all" | "host" | string; data: P2PAction }
  | { t: "leave" };

let socket: WebSocket | null = null;
let role: Role | null = null;
let roomCode = "";
let myName = "";
let myId: string | null = null;
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
  if (role === "host" && myId && roomCode === code) {
    // Resume our own room instead of joining it as a guest
    reconnectAttempts = 0;
    useP2PStore.getState().setStatus("connecting");
    useP2PStore.getState().setLastError(null);
    openSocket({ t: "rejoin", room: code, id: myId });
    armJoinTimeout("Could not reach the game server.");
    return;
  }
  joinRoom(code, playerName);
}

export function dispatch(action: P2PAction): void {
  if (!role || !myId) {
    logger.warn("p2p", "dispatch called but not connected");
    return;
  }

  logger.debug("p2p", `dispatch → ${action.type} (role=${role})`);

  if (role === "host") {
    void hostSession?.handleAction(action, myId);
  } else {
    sendEnvelope({ t: "msg", to: "host", data: action });
  }
}

export function leave(): void {
  sendEnvelope({ t: "leave" });
  cleanup();
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

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);
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
      reconnectAttempts = 0;
      hostSession = new HostSession(sendToAll, roomCode, msg.id, myName);
      useP2PStore.getState().setMyPeerId(msg.id);
      useP2PStore.getState().setReconnectAttempts(0);
      clearJoinTimers();
      useP2PStore.getState().setStatus("connected");
      hostSession.broadcastState();
      logger.info("p2p", `Room ${roomCode} created, my id ${msg.id.slice(0, 8)}`);
      break;
    }

    case "joined": {
      myId = msg.id;
      hostPeerId = msg.hostId;
      reconnectAttempts = 0;
      useP2PStore.getState().setMyPeerId(msg.id);
      useP2PStore.getState().setReconnectAttempts(0);

      if (role === "host") {
        // Resumed our own room after a reconnect
        clearJoinTimers();
        useP2PStore.getState().setStatus("connected");
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
      useP2PStore.getState().removePeer(msg.id);
      hostSession?.handlePeerLeft(msg.id);
      break;
    }

    case "host-down": {
      if (role !== "peer") return;
      logger.warn("p2p", "Host connection lost, waiting for host to return");
      useP2PStore.getState().setStatus("connecting");
      break;
    }

    case "host-up": {
      if (role !== "peer") return;
      logger.info("p2p", "Host is back");
      // Host re-broadcasts state on resume, which flips status to connected
      break;
    }

    case "room-closed": {
      fail("The host closed the room.");
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
      fail(
        myId
          ? "The room no longer exists."
          : "Room not found. Check the code — the host must have the lobby open.",
      );
      break;
    case "room-exists":
      fail("Room code already taken — go back and create a new room.");
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

  if (!myId) {
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
  logger.warn(
    "p2p",
    `Connection lost, reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
  );

  const delay = Math.min(RECONNECT_INTERVAL_MS * reconnectAttempts, MAX_RECONNECT_DELAY_MS);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    if (!role || !myId) return;
    openSocket({ t: "rejoin", room: roomCode, id: myId });
  }, delay);
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
    if (!role || !myId) return;
    if (socket && socket.readyState === WebSocket.OPEN) return;
    logger.info("p2p", "App resumed with dead connection — rejoining");
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    useP2PStore.getState().setStatus("connecting");
    openSocket({ t: "rejoin", room: roomCode, id: myId });
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

function fail(message: string): void {
  clearJoinTimers();
  useP2PStore.getState().setStatus("error");
  useP2PStore.getState().setLastError(message);
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

function handleUnload(): void {
  sendEnvelope({ t: "leave" });
  cleanup();
}

function cleanup(): void {
  clearJoinTimers();
  if (typeof window !== "undefined") {
    window.removeEventListener("beforeunload", handleUnload);
    window.removeEventListener("pagehide", handleUnload);
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
  hostPeerId = null;
  reconnectAttempts = 0;
  peer.resetPeerState();
}
