import { joinRoom as trysteroJoin, selfId } from "trystero/nostr";
import { validateAction } from "./protocol";
import type { P2PAction } from "./protocol";
import type { Room, Song, PlacementResult } from "@/game/types";
import * as logic from "@/game/logic";
import { useGameStore } from "@/game/store";
import { useP2PStore } from "./store";
import { getProvider } from "@/streaming/registry";
import { useStreamingStore } from "@/streaming/store";
import { log as logger } from "@/utils/logger";

const APP_ID = "hitster-p2p-v1";
const JOIN_TIMEOUT_MS = 15_000;
const JOIN_RETRY_MS = 3_000;
const MAX_JOIN_RETRIES = 3;

type Role = "host" | "peer";

let trysteroRoom: ReturnType<typeof trysteroJoin> | null = null;
let sendAction: ((data: P2PAction, targets?: string | string[]) => void) | null =
  null;
let role: Role | null = null;
let hostRoom: Room | null = null;
let myName = "";
let joinSent = false;
let joinTimeout: ReturnType<typeof setTimeout> | null = null;
let joinRetryCount = 0;

export function getMyPeerId(): string {
  return selfId;
}

export function createRoom(roomCode: string, playerName: string): void {
  cleanup();
  role = "host";
  myName = playerName;

  hostRoom = logic.createRoom(roomCode, selfId, playerName);

  connectTransport(roomCode);

  useP2PStore.getState().setMyPeerId(selfId);
  useP2PStore.getState().setStatus("connected");
  broadcastState();

  logger.info("p2p", `Created room ${roomCode} as host`);
}

export function joinRoom(roomCode: string, playerName: string): void {
  cleanup();
  role = "peer";
  myName = playerName;
  joinSent = false;
  joinRetryCount = 0;

  connectTransport(roomCode);

  useP2PStore.getState().setMyPeerId(selfId);
  useP2PStore.getState().setStatus("connecting");
  useP2PStore.getState().setLastError(null);

  // Timeout — if no host responds within 15s, show error
  joinTimeout = setTimeout(() => {
    if (useP2PStore.getState().status === "connecting") {
      useP2PStore.getState().setStatus("error");
      useP2PStore.getState().setLastError(
        "No host found. Check the room code and try again."
      );
      logger.warn("p2p", `Connection timeout for room ${roomCode}`);
    }
  }, JOIN_TIMEOUT_MS);

  logger.info("p2p", `Joining room ${roomCode} as peer`);
}

export function dispatch(action: P2PAction): void {
  if (!role) {
    logger.warn("p2p", "dispatch called but not connected");
    return;
  }

  if (role === "host") {
    processHostAction(action, selfId);
  } else {
    sendToAll(action);
  }
}

export function rejoinRoom(roomCode: string, playerName: string): void {
  logger.info("p2p", `Retrying join for room ${roomCode}`);
  joinRoom(roomCode, playerName);
}

export function leave(): void {
  cleanup();
  useP2PStore.getState().reset();
  useGameStore.getState().reset();
  logger.info("p2p", "Left room");
}

// -- Transport --

function connectTransport(roomCode: string): void {
  trysteroRoom = trysteroJoin({ appId: APP_ID }, roomCode);

  const [send, receive] = trysteroRoom.makeAction("msg");
  sendAction = send as typeof sendAction;

  // Cleanup on browser close / navigation
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);
  }

  receive((data: unknown, peerId: string) => {
    const action = validateAction(data);
    if (!action) {
      logger.warn("p2p", `Rejected invalid message from ${peerId.slice(0, 8)}`);
      return;
    }
    logger.debug("p2p", `← ${action.type} from ${peerId.slice(0, 8)}`);

    if (role === "host") {
      processHostAction(action, peerId);
    } else {
      processPeerMessage(action);
    }
  });

  trysteroRoom.onPeerJoin((peerId: string) => {
    logger.info("p2p", `Peer connected: ${peerId.slice(0, 8)}`);

    if (role === "host") {
      useP2PStore.getState().addPeer({ id: peerId, name: "", connected: true });
      // Immediately send current state so peer knows the room is alive
      if (hostRoom) {
        const state = logic.buildGameState(hostRoom);
        sendToAll({ type: "game-state", payload: state }, peerId);
      }
    }

    if (role === "peer") {
      // Clear timeout — we found a peer
      if (joinTimeout) {
        clearTimeout(joinTimeout);
        joinTimeout = null;
      }

      if (!joinSent) {
        joinSent = true;
        useP2PStore.getState().setStatus("connected");
        sendToAll({ type: "join", payload: { name: myName } });
      }

      // Retry join if we haven't received game-state yet
      joinRetryCount = 0;
      scheduleJoinRetry();
    }
  });

  trysteroRoom.onPeerLeave((peerId: string) => {
    logger.info("p2p", `Peer disconnected: ${peerId.slice(0, 8)}`);
    useP2PStore.getState().removePeer(peerId);

    if (role === "host" && hostRoom) {
      const wasCurrentPlayer = logic.getCurrentPlayer(hostRoom)?.id === peerId;
      const wasBuzzer = hostRoom.buzzerId === peerId;
      hostRoom = logic.removePlayer(hostRoom, peerId);

      // Clear buzzer if the buzzer disconnected
      if (wasBuzzer) {
        hostRoom = { ...hostRoom, buzzerId: null };
      }

      // Not enough players to continue
      if (hostRoom.players.length < 2 && hostRoom.phase !== "lobby") {
        hostRoom = { ...hostRoom, phase: "finished" };
        broadcastState();
        return;
      }

      // Auto-advance if the current player disconnected mid-turn
      if (wasCurrentPlayer && (hostRoom.phase === "playing" || hostRoom.phase === "reveal")) {
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
  });
}

function handleUnload(): void {
  cleanup();
}

function scheduleJoinRetry(): void {
  if (role !== "peer" || !joinSent) return;

  setTimeout(() => {
    // If we still haven't received game state, resend join
    const hasPlayers = useGameStore.getState().players.length > 0;
    if (role === "peer" && joinSent && !hasPlayers && joinRetryCount < MAX_JOIN_RETRIES) {
      joinRetryCount++;
      logger.info("p2p", `Retrying join (attempt ${joinRetryCount}/${MAX_JOIN_RETRIES})`);
      sendToAll({ type: "join", payload: { name: myName } });
      scheduleJoinRetry();
    }
  }, JOIN_RETRY_MS);
}

function cleanup(): void {
  if (joinTimeout) {
    clearTimeout(joinTimeout);
    joinTimeout = null;
  }
  if (typeof window !== "undefined") {
    window.removeEventListener("beforeunload", handleUnload);
    window.removeEventListener("pagehide", handleUnload);
  }
  trysteroRoom?.leave();
  trysteroRoom = null;
  sendAction = null;
  role = null;
  hostRoom = null;
  myName = "";
  joinSent = false;
  joinRetryCount = 0;
}

function sendToAll(action: P2PAction, targets?: string | string[]): void {
  sendAction?.(action, targets);
}

// -- Host Logic --

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
        broadcastState(result);
        break;
      }

      case "guess-song": {
        // Active player guesses BEFORE placing (during playing phase)
        if (hostRoom.phase !== "playing") return;
        const currentForGuess = logic.getCurrentPlayer(hostRoom);
        if (fromPeerId !== currentForGuess?.id) {
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
        // Send result back to guesser, broadcast updated tokens
        sendToAll(
          {
            type: "error",
            payload: {
              message: `${guessResult.titleCorrect ? "Title correct!" : "Title wrong."} ${guessResult.artistCorrect ? "Artist correct!" : "Artist wrong."}${guessResult.titleCorrect || guessResult.artistCorrect ? " +token!" : ""}`,
            },
          },
          fromPeerId,
        );
        broadcastState();
        break;
      }

      case "skip-song": {
        if (hostRoom.phase !== "playing") return;
        const currentForSkip = logic.getCurrentPlayer(hostRoom);
        if (fromPeerId !== currentForSkip?.id) return;
        hostRoom = logic.skipSong(hostRoom, fromPeerId);
        const skipPicked = await pickAndPlayNextSong();
        if (!skipPicked) {
          hostRoom = { ...hostRoom, phase: "finished" };
        }
        broadcastState();
        break;
      }

      case "next-round": {
        const currentForNext = logic.getCurrentPlayer(hostRoom);
        if (fromPeerId !== currentForNext?.id && fromPeerId !== hostRoom.hostId) return;
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
        // Other players can Hitster AFTER the active player placed (reveal phase)
        if (hostRoom.phase !== "reveal") return;
        hostRoom = logic.handleBuzz(hostRoom, fromPeerId);
        broadcastState();
        break;
      }

      case "buzz-place": {
        if (hostRoom.phase !== "reveal") return;
        if (hostRoom.buzzerId !== fromPeerId) {
          sendToAll(
            { type: "error", payload: { message: "You don't have the buzz" } },
            fromPeerId,
          );
          return;
        }
        const { room: buzzUpdated, result: buzzResult } = logic.resolveBuzz(
          hostRoom,
          action.payload.position,
        );
        hostRoom = buzzUpdated;
        broadcastState(buzzResult);
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
          })),
        };
        broadcastState();
        break;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("p2p", `Action error: ${message}`);
    if (fromPeerId !== selfId) {
      sendToAll({ type: "error", payload: { message } }, fromPeerId);
    }
  }
}

function broadcastState(lastResult?: PlacementResult): void {
  if (!hostRoom) return;

  const state = logic.buildGameState(hostRoom);
  if (lastResult) state.lastResult = lastResult;

  useGameStore.getState().applyGameState(state);
  sendToAll({ type: "game-state", payload: state });
}

// -- Peer Logic --

function processPeerMessage(action: P2PAction): void {
  switch (action.type) {
    case "game-state": {
      useGameStore.getState().applyGameState(action.payload);
      const peers = action.payload.players
        .filter((p) => p.id !== selfId)
        .map((p) => ({ id: p.id, name: p.name, connected: true }));
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
      useP2PStore.getState().setLastError(action.payload.message);
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
