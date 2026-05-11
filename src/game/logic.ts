import type { Song, Player, Room, PlacementResult, GameSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export function createRoom(
  code: string,
  hostId: string,
  hostName: string,
  settings?: Partial<GameSettings>
): Room {
  return {
    code,
    hostId,
    players: [createPlayer(hostId, hostName)],
    playlist: [],
    playedSongs: [],
    currentPlayerIndex: 0,
    currentSong: null,
    phase: "lobby",
    settings: { ...DEFAULT_SETTINGS, ...settings },
    buzzerId: null,
    playlistName: null,
  };
}

const STARTING_TOKENS = 2;

export function createPlayer(id: string, name: string): Player {
  return { id, name, score: 0, timeline: [], tokens: STARTING_TOKENS };
}

export function addPlayer(room: Room, id: string, name: string): Room {
  if (room.players.length >= room.settings.maxPlayers) {
    throw new Error("Room is full");
  }
  if (room.phase === "finished") {
    throw new Error("Game is already finished");
  }
  const existing = room.players.find((p) => p.name === name);
  if (existing) {
    return {
      ...room,
      players: room.players.map((p) =>
        p.name === name ? { ...p, id } : p
      ),
    };
  }
  return {
    ...room,
    players: [...room.players, createPlayer(id, name)],
  };
}

export function removePlayer(room: Room, playerId: string): Room {
  const filtered = room.players.filter((p) => p.id !== playerId);
  const newHostId =
    room.hostId === playerId && filtered.length > 0
      ? filtered[0].id
      : room.hostId;

  let currentPlayerIndex = room.currentPlayerIndex;
  const removedIndex = room.players.findIndex((p) => p.id === playerId);
  if (removedIndex !== -1 && removedIndex < currentPlayerIndex) {
    currentPlayerIndex = Math.max(0, currentPlayerIndex - 1);
  }
  if (filtered.length > 0) {
    currentPlayerIndex = currentPlayerIndex % filtered.length;
  }

  return {
    ...room,
    players: filtered,
    hostId: newHostId,
    currentPlayerIndex,
    buzzerId: room.buzzerId === playerId ? null : room.buzzerId,
  };
}

export function pickRandomSong(room: Room): { room: Room; song: Song } | null {
  const available = room.playlist.filter(
    (s) => !room.playedSongs.some((ps) => ps.id === s.id)
  );
  if (available.length === 0) return null;

  const index = Math.floor(Math.random() * available.length);
  const song = available[index];
  return {
    room: {
      ...room,
      currentSong: song,
      playedSongs: [...room.playedSongs, song],
    },
    song,
  };
}

export function checkPlacement(
  timeline: Song[],
  song: Song,
  position: number
): boolean {
  if (timeline.length === 0) return true;

  const before = position > 0 ? timeline[position - 1] : null;
  const after = position < timeline.length ? timeline[position] : null;

  if (before && song.year < before.year) return false;
  if (after && song.year > after.year) return false;

  return true;
}

export function placeSong(
  room: Room,
  playerId: string,
  position: number
): { room: Room; result: PlacementResult } {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");
  if (!room.currentSong) throw new Error("No current song");
  if (position < 0 || position > player.timeline.length) throw new Error("Invalid position");

  const song = room.currentSong;
  const correct = checkPlacement(player.timeline, song, position);

  const updatedTimeline = correct
    ? [
        ...player.timeline.slice(0, position),
        song,
        ...player.timeline.slice(position),
      ]
    : player.timeline;

  const updatedPlayers = room.players.map((p) =>
    p.id === playerId
      ? {
          ...p,
          timeline: updatedTimeline,
          score: updatedTimeline.length,
        }
      : p
  );

  return {
    room: {
      ...room,
      players: updatedPlayers,
      phase: "reveal",
    },
    result: { correct, song },
  };
}

export function advanceTurn(room: Room): Room {
  const nextIndex = (room.currentPlayerIndex + 1) % room.players.length;
  return {
    ...room,
    currentPlayerIndex: nextIndex,
    currentSong: null,
    phase: "playing",
    buzzerId: null,
  };
}

export function checkWinCondition(room: Room): Player | null {
  return (
    room.players.find((p) => p.score >= room.settings.winScore) ?? null
  );
}

export function getCurrentPlayer(room: Room): Player | null {
  return room.players[room.currentPlayerIndex] ?? null;
}

export function startGame(room: Room, playlist: Song[], playlistName?: string): Room {
  const resetPlayers = room.players.map((p) => ({
    ...p,
    score: 0,
    timeline: [],
    tokens: STARTING_TOKENS,
  }));

  return {
    ...room,
    players: resetPlayers,
    playlist,
    playedSongs: [],
    currentPlayerIndex: 0,
    currentSong: null,
    phase: "playing",
    buzzerId: null,
    playlistName: playlistName ?? room.playlistName,
  };
}

export function handleBuzz(
  room: Room,
  buzzerId: string,
): Room {
  if (!room.settings.rules.buzz.enabled) return room;
  if (room.buzzerId) return room;
  const currentPlayer = getCurrentPlayer(room);
  if (currentPlayer?.id === buzzerId) return room;
  const buzzer = room.players.find((p) => p.id === buzzerId);
  if (!buzzer) return room;
  if (buzzer.tokens <= 0) return room;

  // Spend a token
  const updatedPlayers = room.players.map((p) =>
    p.id === buzzerId ? { ...p, tokens: p.tokens - 1 } : p,
  );

  return { ...room, players: updatedPlayers, buzzerId };
}

export function resolveBuzz(
  room: Room,
  position: number,
): { room: Room; result: PlacementResult } {
  if (!room.buzzerId || !room.currentSong) {
    throw new Error("No active buzz");
  }

  const buzzer = room.players.find((p) => p.id === room.buzzerId);
  if (!buzzer) throw new Error("Buzzer player not found");
  if (position < 0 || position > buzzer.timeline.length) throw new Error("Invalid position");

  const song = room.currentSong;
  const correct = checkPlacement(buzzer.timeline, song, position);

  const updatedPlayers = room.players.map((p) => {
    if (p.id !== room.buzzerId) return p;
    if (correct) {
      const newTimeline = [
        ...p.timeline.slice(0, position),
        song,
        ...p.timeline.slice(position),
      ];
      return { ...p, timeline: newTimeline, score: newTimeline.length };
    }
    if (room.settings.rules.buzz.penalty === "lose-point" && p.score > 0) {
      return { ...p, score: p.score - 1 };
    }
    return p;
  });

  return {
    room: { ...room, players: updatedPlayers, buzzerId: null, phase: "reveal" },
    result: { correct, song },
  };
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function guessSongInfo(
  room: Room,
  playerId: string,
  guessTitle: string,
  guessArtist: string,
): { room: Room; titleCorrect: boolean; artistCorrect: boolean } {
  if (!room.currentSong) throw new Error("No current song");

  const titleCorrect = normalize(guessTitle) === normalize(room.currentSong.name);
  const artistCorrect = normalize(guessArtist) === normalize(room.currentSong.artist);

  const tokensEarned = (titleCorrect ? 1 : 0) + (artistCorrect ? 1 : 0);

  if (tokensEarned === 0) {
    return { room, titleCorrect, artistCorrect };
  }

  const updatedPlayers = room.players.map((p) =>
    p.id === playerId ? { ...p, tokens: p.tokens + tokensEarned } : p,
  );

  return { room: { ...room, players: updatedPlayers }, titleCorrect, artistCorrect };
}

export function skipSong(
  room: Room,
  playerId: string,
): Room {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");
  if (player.tokens <= 0) throw new Error("No tokens to spend");

  const updatedPlayers = room.players.map((p) =>
    p.id === playerId ? { ...p, tokens: p.tokens - 1 } : p,
  );

  return { ...room, players: updatedPlayers };
}

export function buildGameState(room: Room): import("./types").GameState {
  const currentPlayer = getCurrentPlayer(room);
  const timelines: Record<string, Song[]> = {};
  for (const p of room.players) {
    timelines[p.id] = p.timeline;
  }

  return {
    roomCode: room.code,
    phase: room.phase,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      timelineLength: p.timeline.length,
      tokens: p.tokens,
    })),
    currentPlayerId: currentPlayer?.id ?? null,
    currentSongUri: room.currentSong?.uri ?? null,
    timelines,
    lastResult: null,
    hostId: room.hostId,
    settings: room.settings,
    playedSongs: room.playedSongs.map((s) => ({
      name: s.name,
      artist: s.artist,
      year: s.year,
    })),
    buzzerId: room.buzzerId,
    playlistName: room.playlistName,
  };
}
