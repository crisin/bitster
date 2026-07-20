import type {
  GameState,
  GameSettings,
  GameRules,
  Phase,
  Song,
  PlacementResult,
} from "@/game/types";

export type P2PAction =
  | { type: "join"; payload: { name: string } }
  | { type: "game-state"; payload: GameState }
  | { type: "start-game"; payload: { playlistUrl: string } }
  | { type: "place-song"; payload: { position: number } }
  | { type: "hitster-buzz" }
  | { type: "buzz-place"; payload: { position: number } }
  | { type: "guess-song"; payload: { title: string; artist: string } }
  | { type: "skip-song" }
  | { type: "next-round" }
  | { type: "reveal-song" }
  | { type: "play-song"; payload: { uri: string } }
  | { type: "update-settings"; payload: Partial<GameSettings> }
  | { type: "rematch" }
  | { type: "error"; payload: { message: string } };

export type P2PActionType = P2PAction["type"];

const PHASES: readonly Phase[] = [
  "lobby",
  "playing",
  "hitster-window",
  "reveal",
  "finished",
];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteInt(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v);
}

function isNonNegativeInt(v: unknown): v is number {
  return isFiniteInt(v) && v >= 0;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length < 1000;
}

function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

function isPhase(v: unknown): v is Phase {
  return typeof v === "string" && (PHASES as readonly string[]).includes(v);
}

// -- game-state validation --
// The game-state payload drives the entire UI on every peer; a malformed or
// malicious blob must never reach the stores as a blind cast.

function parseSong(v: unknown): Song | null {
  if (!isObject(v)) return null;
  if (!isNonEmptyString(v.id) || !isNonEmptyString(v.uri)) return null;
  if (typeof v.name !== "string" || typeof v.artist !== "string") return null;
  // year 0 = masked by the host during the guessing window
  if (!isNonNegativeInt(v.year)) return null;
  const song: Song = {
    id: v.id,
    uri: v.uri,
    name: v.name,
    artist: v.artist,
    year: v.year,
  };
  if (typeof v.imageUrl === "string") song.imageUrl = v.imageUrl;
  return song;
}

function parseSongArray(v: unknown): Song[] | null {
  if (!Array.isArray(v)) return null;
  const songs: Song[] = [];
  for (const item of v) {
    const song = parseSong(item);
    if (!song) return null;
    songs.push(song);
  }
  return songs;
}

function parseTimelines(v: unknown): Record<string, Song[]> | null {
  if (!isObject(v)) return null;
  const out: Record<string, Song[]> = {};
  for (const [key, value] of Object.entries(v)) {
    const songs = parseSongArray(value);
    if (!songs) return null;
    out[key] = songs;
  }
  return out;
}

function parsePlayers(v: unknown): GameState["players"] | null {
  if (!Array.isArray(v)) return null;
  const players: GameState["players"] = [];
  for (const item of v) {
    if (!isObject(item)) return null;
    if (!isNonEmptyString(item.id) || !isNonEmptyString(item.name)) return null;
    if (
      !isNonNegativeInt(item.score) ||
      !isNonNegativeInt(item.timelineLength) ||
      !isNonNegativeInt(item.tokens)
    ) {
      return null;
    }
    players.push({
      id: item.id,
      name: item.name,
      score: item.score,
      timelineLength: item.timelineLength,
      tokens: item.tokens,
    });
  }
  return players;
}

function parseRules(v: unknown): GameRules | null {
  if (!isObject(v) || !isObject(v.buzz)) return null;
  const { enabled, penalty } = v.buzz;
  if (typeof enabled !== "boolean") return null;
  if (penalty !== "none" && penalty !== "lose-point") return null;
  return { buzz: { enabled, penalty } };
}

function parseSettings(v: unknown): GameSettings | null {
  if (!isObject(v)) return null;
  if (!isNonNegativeInt(v.winScore) || !isNonNegativeInt(v.maxPlayers)) return null;
  const rules = parseRules(v.rules);
  if (!rules) return null;
  return { winScore: v.winScore, maxPlayers: v.maxPlayers, rules };
}

function parsePartialSettings(v: unknown): Partial<GameSettings> | null {
  if (!isObject(v)) return null;
  const out: Partial<GameSettings> = {};
  if ("winScore" in v) {
    if (!isNonNegativeInt(v.winScore)) return null;
    out.winScore = v.winScore;
  }
  if ("maxPlayers" in v) {
    if (!isNonNegativeInt(v.maxPlayers)) return null;
    out.maxPlayers = v.maxPlayers;
  }
  if ("rules" in v) {
    const rules = parseRules(v.rules);
    if (!rules) return null;
    out.rules = rules;
  }
  return out;
}

function parsePlacementResult(v: unknown): PlacementResult | null {
  if (!isObject(v) || typeof v.correct !== "boolean") return null;
  const song = parseSong(v.song);
  if (!song) return null;
  return { correct: v.correct, song };
}

function parsePlayedSongs(v: unknown): GameState["playedSongs"] | null {
  if (!Array.isArray(v)) return null;
  const out: GameState["playedSongs"] = [];
  for (const item of v) {
    if (!isObject(item)) return null;
    if (typeof item.name !== "string" || typeof item.artist !== "string") return null;
    if (!isNonNegativeInt(item.year)) return null;
    out.push({ name: item.name, artist: item.artist, year: item.year });
  }
  return out;
}

export function validateGameState(v: unknown): GameState | null {
  if (!isObject(v)) return null;
  if (!isNonEmptyString(v.roomCode) || !isPhase(v.phase)) return null;
  if (!isNonEmptyString(v.hostId)) return null;
  if (
    !isStringOrNull(v.currentPlayerId ?? null) ||
    !isStringOrNull(v.currentSongUri ?? null) ||
    !isStringOrNull(v.currentSongId ?? null) ||
    !isStringOrNull(v.buzzerId ?? null) ||
    !isStringOrNull(v.playlistName ?? null)
  ) {
    return null;
  }

  const players = parsePlayers(v.players);
  const timelines = parseTimelines(v.timelines);
  const failedTimelines = parseTimelines(v.failedTimelines ?? {});
  const settings = parseSettings(v.settings);
  const playedSongs = parsePlayedSongs(v.playedSongs);
  if (!players || !timelines || !failedTimelines || !settings || !playedSongs) {
    return null;
  }

  let lastResult: PlacementResult | null = null;
  if (v.lastResult != null) {
    lastResult = parsePlacementResult(v.lastResult);
    if (!lastResult) return null;
  }

  let guessResult: GameState["guessResult"] = null;
  if (v.guessResult != null) {
    if (
      !isObject(v.guessResult) ||
      typeof v.guessResult.titleCorrect !== "boolean" ||
      typeof v.guessResult.artistCorrect !== "boolean"
    ) {
      return null;
    }
    guessResult = {
      titleCorrect: v.guessResult.titleCorrect,
      artistCorrect: v.guessResult.artistCorrect,
    };
  }

  return {
    roomCode: v.roomCode,
    phase: v.phase,
    players,
    currentPlayerId: (v.currentPlayerId ?? null) as string | null,
    currentSongUri: (v.currentSongUri ?? null) as string | null,
    currentSongId: (v.currentSongId ?? null) as string | null,
    timelines,
    failedTimelines,
    lastResult,
    hostId: v.hostId,
    settings,
    playedSongs,
    buzzerId: (v.buzzerId ?? null) as string | null,
    playlistName: (v.playlistName ?? null) as string | null,
    guessResult,
  };
}

export function validateAction(data: unknown): P2PAction | null {
  if (!isObject(data) || typeof data.type !== "string") return null;

  const p = data.payload;

  switch (data.type) {
    case "join":
      if (!isObject(p) || !isNonEmptyString(p.name)) return null;
      return { type: "join", payload: { name: p.name } };

    case "game-state": {
      const state = validateGameState(p);
      if (!state) return null;
      return { type: "game-state", payload: state };
    }

    case "start-game":
      if (!isObject(p) || typeof p.playlistUrl !== "string") return null;
      return { type: "start-game", payload: { playlistUrl: p.playlistUrl } };

    case "place-song":
      if (!isObject(p) || !isNonNegativeInt(p.position)) return null;
      return { type: "place-song", payload: { position: p.position } };

    case "hitster-buzz":
      return { type: "hitster-buzz" };

    case "buzz-place":
      if (!isObject(p) || !isNonNegativeInt(p.position)) return null;
      return { type: "buzz-place", payload: { position: p.position } };

    case "guess-song":
      if (!isObject(p) || typeof p.title !== "string" || typeof p.artist !== "string") return null;
      return { type: "guess-song", payload: { title: p.title, artist: p.artist } };

    case "skip-song":
      return { type: "skip-song" };

    case "next-round":
      return { type: "next-round" };

    case "reveal-song":
      return { type: "reveal-song" };

    case "play-song":
      if (!isObject(p) || !isNonEmptyString(p.uri)) return null;
      return { type: "play-song", payload: { uri: p.uri } };

    case "update-settings": {
      const settings = parsePartialSettings(p);
      if (!settings) return null;
      return { type: "update-settings", payload: settings };
    }

    case "rematch":
      return { type: "rematch" };

    case "error":
      if (!isObject(p) || typeof p.message !== "string") return null;
      return { type: "error", payload: { message: p.message } };

    default:
      return null;
  }
}
