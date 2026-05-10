import { joinRoom as trysteroJoin, selfId } from "trystero/nostr";
import type { P2PAction } from "./protocol";
import type { Room, Song, PlacementResult } from "@/game/types";
import * as logic from "@/game/logic";
import { useGameStore } from "@/game/store";
import { useP2PStore } from "./store";
import { log as logger } from "@/utils/logger";

const APP_ID = "hitster-p2p-v1";

type Role = "host" | "peer";

let trysteroRoom: ReturnType<typeof trysteroJoin> | null = null;
let sendAction: ((data: P2PAction, targets?: string | string[]) => void) | null =
  null;
let role: Role | null = null;
let hostRoom: Room | null = null;
let myName = "";
let joinSent = false;

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

  connectTransport(roomCode);

  useP2PStore.getState().setMyPeerId(selfId);
  useP2PStore.getState().setStatus("connecting");

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

  receive((data: unknown, peerId: string) => {
    const action = data as P2PAction;
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
    }

    if (role === "peer" && !joinSent) {
      joinSent = true;
      useP2PStore.getState().setStatus("connected");
      sendToAll({ type: "join", payload: { name: myName } });
    }
  });

  trysteroRoom.onPeerLeave((peerId: string) => {
    logger.info("p2p", `Peer disconnected: ${peerId.slice(0, 8)}`);
    useP2PStore.getState().removePeer(peerId);

    if (role === "host" && hostRoom) {
      hostRoom = logic.removePlayer(hostRoom, peerId);
      broadcastState();
    }
  });
}

function cleanup(): void {
  trysteroRoom?.leave();
  trysteroRoom = null;
  sendAction = null;
  role = null;
  hostRoom = null;
  myName = "";
  joinSent = false;
}

function sendToAll(action: P2PAction, targets?: string | string[]): void {
  sendAction?.(action, targets);
}

// -- Host Logic --

function processHostAction(action: P2PAction, fromPeerId: string): void {
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
        const playlist = getMockPlaylist();
        hostRoom = logic.startGame(hostRoom, playlist);
        const pick = logic.pickRandomSong(hostRoom);
        if (pick) hostRoom = pick.room;
        broadcastState();
        break;
      }

      case "place-song": {
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

      case "next-round": {
        const winner = logic.checkWinCondition(hostRoom);
        if (winner) {
          hostRoom = { ...hostRoom, phase: "finished" };
        } else {
          hostRoom = logic.advanceTurn(hostRoom);
          const pick = logic.pickRandomSong(hostRoom);
          if (pick) {
            hostRoom = pick.room;
          } else {
            hostRoom = { ...hostRoom, phase: "finished" };
          }
        }
        broadcastState();
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
          currentSong: null,
          currentPlayerIndex: 0,
          players: hostRoom.players.map((p) => ({
            ...p,
            score: 0,
            timeline: [],
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
    case "error": {
      logger.error("p2p", `Host error: ${action.payload.message}`);
      useP2PStore.getState().setLastError(action.payload.message);
      break;
    }
  }
}

// -- Mock Data (temporary until streaming provider is wired) --

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
