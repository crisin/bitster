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
    playlistId: null,
    playlistTrackCount: 0,
    playedIndices: [],
  };
}

const STARTING_TOKENS = 2;

export function createPlayer(id: string, name: string): Player {
  return { id, name, score: 0, timeline: [], tokens: STARTING_TOKENS, failedSongs: [] };
}

export function addPlayer(room: Room, id: string, name: string): Room {
  // Same peer ID reconnecting — update name only
  const existingById = room.players.find((p) => p.id === id);
  if (existingById) {
    return {
      ...room,
      players: room.players.map((p) =>
        p.id === id ? { ...p, name } : p
      ),
    };
  }

  if (room.phase === "finished") {
    throw new Error("Game is already finished");
  }
  if (room.phase !== "lobby") {
    throw new Error("Game is already in progress");
  }

  if (room.players.length >= room.settings.maxPlayers) {
    throw new Error("Room is full");
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

export function pickRandomIndex(
  trackCount: number,
  playedIndices: number[],
): number | null {
  if (trackCount === 0 || playedIndices.length >= trackCount) return null;

  const played = new Set(playedIndices);
  let index: number;
  let attempts = 0;
  do {
    index = Math.floor(Math.random() * trackCount);
    attempts++;
    // Safety: if almost all songs played, build available list instead
    if (attempts > 100) {
      const available: number[] = [];
      for (let i = 0; i < trackCount; i++) {
        if (!played.has(i)) available.push(i);
      }
      if (available.length === 0) return null;
      return available[Math.floor(Math.random() * available.length)];
    }
  } while (played.has(index));

  return index;
}

export function setSongFromIndex(
  room: Room,
  song: Song,
  index: number,
): Room {
  return {
    ...room,
    currentSong: song,
    playedSongs: [...room.playedSongs, song],
    playedIndices: [...room.playedIndices, index],
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

  // Always insert card (tentatively) — removed during reveal if wrong
  const updatedTimeline = [
    ...player.timeline.slice(0, position),
    song,
    ...player.timeline.slice(position),
  ];

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
      phase: "hitster-window",
    },
    result: { correct, song },
  };
}

/** Remove a tentatively placed song from a player's timeline and track it as failed. */
export function undoPlacement(room: Room, playerId: string, songId: string): Room {
  const updatedPlayers = room.players.map((p) => {
    if (p.id !== playerId) return p;
    const failed = p.timeline.find((s) => s.id === songId);
    const newTimeline = p.timeline.filter((s) => s.id !== songId);
    return {
      ...p,
      timeline: newTimeline,
      score: newTimeline.length,
      failedSongs: failed ? [...p.failedSongs, failed] : p.failedSongs,
    };
  });
  return { ...room, players: updatedPlayers };
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

export function startGame(
  room: Room,
  playlist: Song[],
  playlistName?: string,
  playlistId?: string,
  playlistTrackCount?: number,
): Room {
  const resetPlayers = room.players.map((p) => ({
    ...p,
    score: 0,
    timeline: [],
    tokens: STARTING_TOKENS,
    failedSongs: [],
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
    playlistId: playlistId ?? null,
    playlistTrackCount: playlistTrackCount ?? 0,
    playedIndices: [],
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

/** Normalize a string for fuzzy comparison: strip diacritics, lowercase, ß→ss, non-alphanum removed */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

/** Split an artist credit string into individual artist names */
function splitArtists(artist: string): string[] {
  return artist
    .split(/[,\/&]|\s+(?:feat\.?|ft\.?|featuring|with|x|and|und)\s+/i)
    .map((s) => normalize(s.trim()))
    .filter((s) => s.length > 0);
}

/** Strip remix/feat/edition suffixes from a song title */
function stripTitleSuffix(title: string): string {
  return title
    .replace(/\s*[\(\[].*?[\)\]]/g, "")
    .replace(
      /\s*-\s*(remix|edit|mix|version|remaster|remastered|live|acoustic|radio|extended|deluxe|bonus|original|clean|explicit).*$/i,
      "",
    )
    .replace(/\s*feat\.?\s+.*$/i, "")
    .replace(/\s*ft\.?\s+.*$/i, "")
    .trim();
}

/** Check if a guessed title matches the actual title (fuzzy) */
function checkTitleMatch(guess: string, actual: string): boolean {
  const g = normalize(guess);
  const a = normalize(actual);
  if (g.length === 0) return false;
  if (g === a) return true;
  // Try with stripped suffixes (handles remixes, feat. tags, edition labels)
  const gStripped = normalize(stripTitleSuffix(guess));
  const aStripped = normalize(stripTitleSuffix(actual));
  if (gStripped.length > 0 && aStripped.length > 0 && gStripped === aStripped) return true;
  return false;
}

/** Check if a guessed artist matches any of the actual artists (fuzzy) */
function checkArtistMatch(guess: string, actual: string): boolean {
  if (normalize(guess).length === 0) return false;

  const actualParts = splitArtists(actual);
  const guessParts = splitArtists(guess);

  if (actualParts.length === 0 || guessParts.length === 0) {
    return normalize(guess) === normalize(actual);
  }

  // Any guess part exactly matches any actual part
  if (guessParts.some((g) => actualParts.some((a) => a === g))) return true;

  // Containment: actual artist found within a guess part (handles "eminemrihanna" containing "eminem")
  if (guessParts.some((g) => actualParts.some((a) => a.length >= 3 && g.includes(a)))) return true;

  // Reverse containment: guess part found within an actual artist name
  if (guessParts.some((g) => g.length >= 3 && actualParts.some((a) => a.includes(g)))) return true;

  return false;
}

export function guessSongInfo(
  room: Room,
  playerId: string,
  guessTitle: string,
  guessArtist: string,
): { room: Room; titleCorrect: boolean; artistCorrect: boolean } {
  if (!room.currentSong) throw new Error("No current song");

  const titleCorrect = checkTitleMatch(guessTitle, room.currentSong.name);
  const artistCorrect = checkArtistMatch(guessArtist, room.currentSong.artist);

  // Token only awarded when BOTH title and artist are correct
  const tokensEarned = (titleCorrect && artistCorrect) ? 1 : 0;

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

  // While the current song is still being guessed/challenged, its metadata must
  // not reach the peers: it IS the answer (title/artist for the guess, year for
  // the placement). It appears in playedSongs and timelines only from reveal on.
  const secretSongId =
    room.phase === "playing" || room.phase === "hitster-window"
      ? room.currentSong?.id ?? null
      : null;

  const timelines: Record<string, Song[]> = {};
  const failedTimelines: Record<string, Song[]> = {};
  for (const p of room.players) {
    timelines[p.id] = secretSongId
      ? p.timeline.map((s) => (s.id === secretSongId ? { ...s, year: 0 } : s))
      : p.timeline;
    failedTimelines[p.id] = p.failedSongs;
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
    currentSongId: room.currentSong?.id ?? null,
    timelines,
    failedTimelines,
    lastResult: null,
    hostId: room.hostId,
    settings: room.settings,
    playedSongs: room.playedSongs
      .filter((s) => s.id !== secretSongId)
      .map((s) => ({
        name: s.name,
        artist: s.artist,
        year: s.year,
      })),
    buzzerId: room.buzzerId,
    playlistName: room.playlistName,
    guessResult: null,
  };
}
