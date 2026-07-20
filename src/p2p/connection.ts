import { validateAction } from "./protocol";
import type { P2PAction } from "./protocol";
import type { Room, Song, PlacementResult } from "@/game/types";
import * as logic from "@/game/logic";
import { useGameStore } from "@/game/store";
import { useP2PStore } from "./store";
import { getProvider } from "@/streaming/registry";
import { useStreamingStore } from "@/streaming/store";
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
let hostRoom: Room | null = null;
let receivedInitialState = false;
let reconnectAttempts = 0;
let joinTimeout: ReturnType<typeof setTimeout> | null = null;
let joinRetryTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pendingResult: PlacementResult | null = null;
let pendingGuessResult: { titleCorrect: boolean; artistCorrect: boolean } | null = null;

function getRelayUrl(): string | null {
  const env = process.env.EXPO_PUBLIC_RELAY_URL;
  if (env) return env;
  if (typeof window !== "undefined" && window.location?.host) {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws`;
  }
  return null;
}

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
    void processHostAction(action, myId);
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

function handleServerMsg(msg: ServerMsg): void {
  switch (msg.t) {
    case "created": {
      myId = msg.id;
      reconnectAttempts = 0;
      hostRoom = logic.createRoom(roomCode, msg.id, myName);
      useP2PStore.getState().setMyPeerId(msg.id);
      useP2PStore.getState().setReconnectAttempts(0);
      clearJoinTimers();
      useP2PStore.getState().setStatus("connected");
      broadcastState();
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
        broadcastState();
        logger.info("p2p", "Resumed room as host");
      } else {
        // Server confirmed the room exists — now ask the host to add us.
        // Status flips to "connected" when the first game-state arrives.
        receivedInitialState = false;
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
        void processHostAction(action, msg.from);
      } else {
        if (msg.from !== hostPeerId) {
          logger.warn("p2p", `Ignoring ${action.type} from non-host ${msg.from.slice(0, 8)}`);
          return;
        }
        processPeerMessage(action);
      }
      break;
    }

    case "peer-joined": {
      if (role !== "host" || !hostRoom) return;
      logger.info("p2p", `Peer connected: ${msg.id.slice(0, 8)}`);
      useP2PStore.getState().addPeer({ id: msg.id, name: "", connected: true });
      // Send current state right away so the peer sees the room is alive
      sendEnvelope({
        t: "msg",
        to: msg.id,
        data: { type: "game-state", payload: logic.buildGameState(hostRoom) },
      });
      break;
    }

    case "peer-left": {
      if (role !== "host") return;
      logger.info("p2p", `Peer disconnected: ${msg.id.slice(0, 8)}`);
      useP2PStore.getState().removePeer(msg.id);
      handlePeerLeft(msg.id);
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

function sendJoinAction(): void {
  sendEnvelope({ t: "msg", to: "host", data: { type: "join", payload: { name: myName } } });
}

function scheduleJoinRetry(attempt: number): void {
  if (joinRetryTimer) clearTimeout(joinRetryTimer);
  joinRetryTimer = setTimeout(() => {
    if (role !== "peer" || receivedInitialState) return;
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
  const s = socket;
  socket = null;
  s?.close();
  role = null;
  roomCode = "";
  myName = "";
  myId = null;
  hostPeerId = null;
  hostRoom = null;
  receivedInitialState = false;
  reconnectAttempts = 0;
  pendingResult = null;
  pendingGuessResult = null;
}

function sendToAll(action: P2PAction, target?: string): void {
  sendEnvelope({ t: "msg", to: target ?? "all", data: action });
}

// -- Host Logic --

function handlePeerLeft(peerId: string): void {
  if (!hostRoom) return;

  const wasCurrentPlayer = logic.getCurrentPlayer(hostRoom)?.id === peerId;
  const wasBuzzer = hostRoom.buzzerId === peerId;

  // If current player disconnects during hitster-window, undo their tentative placement
  if (wasCurrentPlayer && hostRoom.phase === "hitster-window" && pendingResult) {
    hostRoom = logic.undoPlacement(hostRoom, peerId, pendingResult.song.id);
    pendingResult = null;
  }

  hostRoom = logic.removePlayer(hostRoom, peerId);

  // Clear buzzer if the buzzer disconnected
  if (wasBuzzer) {
    hostRoom = { ...hostRoom, buzzerId: null };
  }

  // Not enough players to continue
  if (hostRoom.players.length < 2 && hostRoom.phase !== "lobby") {
    hostRoom = { ...hostRoom, phase: "finished" };
    pendingResult = null;
    broadcastState();
    return;
  }

  // Auto-advance if the current player disconnected mid-turn
  if (
    wasCurrentPlayer &&
    (hostRoom.phase === "playing" ||
      hostRoom.phase === "reveal" ||
      hostRoom.phase === "hitster-window")
  ) {
    hostRoom = logic.advanceTurn(hostRoom);
    pickAndPlayNextSong().then((picked) => {
      if (!picked && hostRoom) {
        hostRoom = { ...hostRoom, phase: "finished" };
      }
      broadcastState();
    });
    return;
  }

  broadcastState();
}

async function processHostAction(action: P2PAction, fromPeerId: string): Promise<void> {
  if (!hostRoom) return;

  try {
    switch (action.type) {
      case "join": {
        hostRoom = logic.addPlayer(hostRoom, fromPeerId, action.payload.name);
        useP2PStore
          .getState()
          .updatePeer(fromPeerId, { name: action.payload.name });
        broadcastState();
        break;
      }

      case "start-game": {
        if (fromPeerId !== hostRoom.hostId) return;
        pendingGuessResult = null;
        const meta = await resolvePlaylist(action.payload.playlistUrl);
        if (meta) {
          // Lazy loading — only fetch meta, songs loaded on demand
          hostRoom = logic.startGame(
            hostRoom, [], meta.name, meta.playlistId, meta.trackCount,
          );
        } else {
          // No provider or URL — fallback to mock
          const mock = getMockPlaylist();
          hostRoom = logic.startGame(hostRoom, mock, "Demo Playlist");
        }
        const picked = await pickAndPlayNextSong();
        if (!picked) {
          hostRoom = { ...hostRoom, phase: "finished" };
        }
        broadcastState();
        break;
      }

      case "place-song": {
        if (hostRoom.phase !== "playing") return;
        if (hostRoom.buzzerId) {
          sendToAll(
            { type: "error", payload: { message: "Wait for buzzer to place" } },
            fromPeerId,
          );
          return;
        }
        const current = logic.getCurrentPlayer(hostRoom);
        if (current?.id !== fromPeerId) {
          sendToAll(
            { type: "error", payload: { message: "Not your turn" } },
            fromPeerId,
          );
          return;
        }
        const { room: updated, result } = logic.placeSong(
          hostRoom,
          fromPeerId,
          action.payload.position,
        );
        hostRoom = updated;
        // Store result for reveal — don't broadcast yet (year hidden during hitster-window)
        pendingResult = result;
        broadcastState();
        break;
      }

      case "guess-song": {
        // Active player guesses BEFORE placing (during playing phase)
        if (hostRoom.phase !== "playing") {
          logger.warn("p2p", `guess-song rejected: phase is "${hostRoom.phase}", not "playing"`);
          return;
        }
        const currentForGuess = logic.getCurrentPlayer(hostRoom);
        if (fromPeerId !== currentForGuess?.id) {
          logger.warn("p2p",
            `guess-song rejected: sender ${fromPeerId.slice(0, 8)} is not current player ${currentForGuess?.id?.slice(0, 8) ?? "null"}`,
          );
          sendToAll(
            { type: "error", payload: { message: "Only the active player can guess" } },
            fromPeerId,
          );
          return;
        }
        const guessResult = logic.guessSongInfo(
          hostRoom,
          fromPeerId,
          action.payload.title,
          action.payload.artist,
        );
        hostRoom = guessResult.room;
        logger.debug("p2p",
          `guess result: title=${guessResult.titleCorrect}, artist=${guessResult.artistCorrect}`,
        );
        // Store result — feedback shown after placing (hitster-window phase)
        pendingGuessResult = {
          titleCorrect: guessResult.titleCorrect,
          artistCorrect: guessResult.artistCorrect,
        };
        // Broadcast updated tokens but don't reveal guess correctness yet
        broadcastState();
        break;
      }

      case "skip-song": {
        if (hostRoom.phase !== "playing") return;
        const currentForSkip = logic.getCurrentPlayer(hostRoom);
        if (fromPeerId !== currentForSkip?.id) return;
        hostRoom = logic.skipSong(hostRoom, fromPeerId);
        pendingGuessResult = null;
        const skipPicked = await pickAndPlayNextSong();
        if (!skipPicked) {
          hostRoom = { ...hostRoom, phase: "finished" };
        }
        broadcastState();
        break;
      }

      case "next-round": {
        if (hostRoom.phase !== "reveal") return;
        const currentForNext = logic.getCurrentPlayer(hostRoom);
        if (fromPeerId !== currentForNext?.id && fromPeerId !== hostRoom.hostId) return;
        pendingGuessResult = null;
        const winner = logic.checkWinCondition(hostRoom);
        if (winner) {
          hostRoom = { ...hostRoom, phase: "finished" };
          broadcastState();
        } else {
          hostRoom = logic.advanceTurn(hostRoom);
          const nextPicked = await pickAndPlayNextSong();
          if (!nextPicked) {
            hostRoom = { ...hostRoom, phase: "finished" };
          }
          broadcastState();
        }
        break;
      }

      case "hitster-buzz": {
        // Other players can Hitster during hitster-window (before year is revealed)
        if (hostRoom.phase !== "hitster-window") return;
        hostRoom = logic.handleBuzz(hostRoom, fromPeerId);
        broadcastState();
        break;
      }

      case "buzz-place": {
        if (hostRoom.phase !== "hitster-window") return;
        if (hostRoom.buzzerId !== fromPeerId) {
          sendToAll(
            { type: "error", payload: { message: "You don't have the buzz" } },
            fromPeerId,
          );
          return;
        }
        // Buzzer placed — auto-trigger reveal with their position
        doRevealSong(action.payload.position);
        break;
      }

      case "reveal-song": {
        if (hostRoom.phase !== "hitster-window") return;
        const currentForReveal = logic.getCurrentPlayer(hostRoom);
        if (fromPeerId !== currentForReveal?.id && fromPeerId !== hostRoom.hostId) return;
        doRevealSong(null);
        break;
      }

      case "kick-player": {
        if (fromPeerId !== hostRoom.hostId) return;
        hostRoom = logic.removePlayer(hostRoom, action.payload.playerId);
        broadcastState();
        break;
      }

      case "update-settings": {
        if (fromPeerId !== hostRoom.hostId) return;
        hostRoom = {
          ...hostRoom,
          settings: { ...hostRoom.settings, ...action.payload },
        };
        broadcastState();
        break;
      }

      case "rematch": {
        if (fromPeerId !== hostRoom.hostId) return;
        pendingGuessResult = null;
        pendingResult = null;
        hostRoom = {
          ...hostRoom,
          phase: "lobby",
          playedSongs: [],
          playedIndices: [],
          currentSong: null,
          currentPlayerIndex: 0,
          buzzerId: null,
          players: hostRoom.players.map((p) => ({
            ...p,
            score: 0,
            timeline: [],
            tokens: 2,
            failedSongs: [],
          })),
        };
        broadcastState();
        break;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("p2p", `Action error: ${message}`);
    if (fromPeerId !== myId) {
      sendToAll({ type: "error", payload: { message } }, fromPeerId);
    }
  }
}

/**
 * Resolves the hitster-window: checks active player's placement,
 * handles buzz resolution, transitions to reveal phase.
 */
function doRevealSong(buzzPosition: number | null): void {
  if (!hostRoom || !pendingResult) return;

  const currentPlayer = logic.getCurrentPlayer(hostRoom);

  // If active player was wrong, remove the tentatively placed card
  if (!pendingResult.correct && currentPlayer) {
    hostRoom = logic.undoPlacement(hostRoom, currentPlayer.id, pendingResult.song.id);
  }

  // Handle buzz resolution
  if (hostRoom.buzzerId && buzzPosition !== null) {
    if (pendingResult.correct) {
      // Active player was right — buzzer challenged incorrectly (token already spent)
      hostRoom = { ...hostRoom, buzzerId: null };
    } else {
      // Active player wrong — resolve buzzer's placement
      const { room: buzzRoom } = logic.resolveBuzz(hostRoom, buzzPosition);
      hostRoom = buzzRoom;
    }
  }

  // Transition to reveal
  hostRoom = { ...hostRoom, phase: "reveal", buzzerId: null };
  broadcastState(pendingResult);
  pendingResult = null;
}

function broadcastState(lastResult?: PlacementResult): void {
  if (!hostRoom) return;

  const state = logic.buildGameState(hostRoom);
  if (lastResult) state.lastResult = lastResult;
  // Include guess result during hitster-window and reveal phases
  if (pendingGuessResult && (hostRoom.phase === "hitster-window" || hostRoom.phase === "reveal")) {
    state.guessResult = pendingGuessResult;
  }

  useGameStore.getState().applyGameState(state);
  sendToAll({ type: "game-state", payload: state });
}

// -- Peer Logic --

function processPeerMessage(action: P2PAction): void {
  switch (action.type) {
    case "game-state": {
      if (!receivedInitialState) {
        receivedInitialState = true;
        clearJoinTimers();
      }
      useP2PStore.getState().setStatus("connected");
      useGameStore.getState().applyGameState(action.payload);
      const peers = action.payload.players
        .filter((p: { id: string }) => p.id !== myId)
        .map((p: { id: string; name: string }) => ({ id: p.id, name: p.name, connected: true }));
      useP2PStore.getState().setPeers(peers);
      break;
    }
    case "play-song": {
      const providerId = useStreamingStore.getState().activeProviderId;
      const provider = providerId ? getProvider(providerId) : null;
      if (provider) {
        provider.player.play(action.payload.uri).catch((err) => {
          logger.error("p2p", `Peer playback failed: ${err}`);
        });
      }
      break;
    }
    case "pause-song": {
      const providerId = useStreamingStore.getState().activeProviderId;
      const provider = providerId ? getProvider(providerId) : null;
      if (provider) {
        provider.player.pause().catch((err) => {
          logger.error("p2p", `Peer pause failed: ${err}`);
        });
      }
      break;
    }
    case "error": {
      logger.error("p2p", `Host error: ${action.payload.message}`);
      if (!receivedInitialState) {
        // Rejected before we ever got state (room full, game running) — fatal
        fail(action.payload.message);
      } else {
        useP2PStore.getState().setLastError(action.payload.message);
      }
      break;
    }
  }
}

// -- Streaming Integration --

async function resolvePlaylist(
  playlistUrl: string,
): Promise<{ playlistId: string; name: string; trackCount: number } | null> {
  const providerId = useStreamingStore.getState().activeProviderId;
  const provider = providerId ? getProvider(providerId) : null;

  if (!provider || !playlistUrl) return null;

  const playlistId = provider.library.parsePlaylistUrl(playlistUrl);
  if (!playlistId) return null;

  try {
    const meta = await provider.library.getPlaylistMeta(playlistId);
    if (meta.trackCount === 0) return null;
    logger.info("p2p", `Playlist "${meta.name}" — ${meta.trackCount} tracks (lazy loading)`);
    return { playlistId, name: meta.name, trackCount: meta.trackCount };
  } catch (err) {
    logger.error("p2p", `Playlist meta failed: ${err}`);
    return null;
  }
}

/**
 * Picks a random song and plays it on all devices.
 * Uses lazy loading (1 API call) for provider playlists,
 * or the in-memory array for mock playlists.
 */
async function pickAndPlayNextSong(): Promise<boolean> {
  if (!hostRoom) return false;

  let song: Song | null = null;

  const currentPlaylistId = hostRoom.playlistId;
  if (currentPlaylistId) {
    // Lazy loading — fetch one track at a random index
    const providerId = useStreamingStore.getState().activeProviderId;
    const provider = providerId ? getProvider(providerId) : null;
    if (!provider) return false;

    // Try up to 5 indices (some tracks may be unavailable/missing year)
    for (let attempt = 0; attempt < 5; attempt++) {
      const index = logic.pickRandomIndex(
        hostRoom.playlistTrackCount,
        hostRoom.playedIndices,
      );
      if (index === null) return false;

      try {
        const track = await provider.library.getTrackAtIndex(
          currentPlaylistId,
          index,
        );
        if (track) {
          hostRoom = logic.setSongFromIndex(hostRoom, track, index);
          song = track;
          break;
        }
      } catch (err) {
        logger.warn("p2p", `Track fetch at index ${index} failed: ${err}`);
      }
      // Mark this index as used so we don't retry it
      hostRoom = {
        ...hostRoom,
        playedIndices: [...hostRoom.playedIndices, index],
      };
    }
  } else {
    // Mock/fallback — use in-memory array
    const pick = logic.pickRandomSong(hostRoom);
    if (!pick) return false;
    hostRoom = pick.room;
    song = pick.song;
  }

  if (!song) return false;

  await playSongOnAllDevices(song.uri);
  return true;
}

async function playSongOnAllDevices(uri: string): Promise<void> {
  sendToAll({ type: "play-song", payload: { uri } });

  const providerId = useStreamingStore.getState().activeProviderId;
  const provider = providerId ? getProvider(providerId) : null;
  if (provider) {
    try {
      await provider.player.play(uri);
    } catch (err) {
      logger.error("p2p", `Host playback failed: ${err}`);
    }
  }
}

// -- Mock Data (fallback until streaming provider is connected) --

function getMockPlaylist(): Song[] {
  return [
    { id: "1", uri: "mock:1", name: "Bohemian Rhapsody", artist: "Queen", year: 1975 },
    { id: "2", uri: "mock:2", name: "Billie Jean", artist: "Michael Jackson", year: 1982 },
    { id: "3", uri: "mock:3", name: "Smells Like Teen Spirit", artist: "Nirvana", year: 1991 },
    { id: "4", uri: "mock:4", name: "Lose Yourself", artist: "Eminem", year: 2002 },
    { id: "5", uri: "mock:5", name: "Rolling in the Deep", artist: "Adele", year: 2010 },
    { id: "6", uri: "mock:6", name: "Shape of You", artist: "Ed Sheeran", year: 2017 },
    { id: "7", uri: "mock:7", name: "Blinding Lights", artist: "The Weeknd", year: 2019 },
    { id: "8", uri: "mock:8", name: "Hotel California", artist: "Eagles", year: 1977 },
    { id: "9", uri: "mock:9", name: "Sweet Child O' Mine", artist: "Guns N' Roses", year: 1987 },
    { id: "10", uri: "mock:10", name: "Wonderwall", artist: "Oasis", year: 1995 },
    { id: "11", uri: "mock:11", name: "Hey Ya!", artist: "OutKast", year: 2003 },
    { id: "12", uri: "mock:12", name: "Uptown Funk", artist: "Bruno Mars", year: 2014 },
  ];
}
