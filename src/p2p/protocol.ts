import type {
  GameRecap,
  GameRules,
  GameSettings,
  GameState,
  Phase,
  PlacementResult,
  Player,
  PlayerStats,
  RecapPlayer,
  RecapReason,
  Room,
  RoundBuzz,
  RoundGuess,
  RoundOutcome,
  RoundRecord,
  Song,
} from "@/game/types";
import {
  EMPTY_STATS,
  MAX_RANDOM_POOL,
  MAX_ROUNDS_PER_GAME,
  MIN_RANDOM_POOL,
  RECAP_VERSION,
} from "@/game/types";
import { buildSong } from "@/schema/song";

export type P2PAction =
  | { type: "join"; payload: { name: string } }
  | { type: "add-local-player"; payload: { name: string } }
  | { type: "remove-local-player"; payload: { playerId: string } }
  | { type: "game-state"; payload: GameState }
  | { type: "start-game"; payload: { playlistUrl: string } }
  | { type: "place-song"; payload: { position: number } }
  | { type: "bitster-buzz" }
  | { type: "bitster-pass" }
  | { type: "buzz-select"; payload: { position: number } }
  | { type: "buzz-place"; payload: { position: number } }
  | { type: "set-playlist"; payload: { playlistUrl: string } }
  | { type: "set-random-pool"; payload: { target: number } }
  | { type: "guess-song"; payload: { title: string; artist: string; year?: number } }
  | { type: "skip-song" }
  | { type: "next-round" }
  | { type: "reveal-song" }
  | { type: "play-song"; payload: { uri: string } }
  | { type: "update-settings"; payload: Partial<GameSettings> }
  | { type: "rematch" }
  | { type: "game-recap"; payload: GameRecap }
  | { type: "error"; payload: { message: string } };

const PHASES: readonly Phase[] = [
  "lobby",
  "playing",
  "bitster-window",
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
  // Field kinds, bounds and required-ness live in src/schema/song.ts, so a new
  // field cannot silently fall off here. Unknown keys are dropped as before.
  return buildSong((name) => v[name]);
}

/** Stats ride along per player; tolerate hosts that don't send them yet */
function parseStats(v: unknown): PlayerStats | null {
  if (v === undefined) return { ...EMPTY_STATS };
  if (!isObject(v)) return null;
  const out: PlayerStats = { ...EMPTY_STATS };
  for (const key of Object.keys(EMPTY_STATS) as (keyof PlayerStats)[]) {
    const value = v[key];
    if (value === undefined) continue;
    if (!isNonNegativeInt(value)) return null;
    out[key] = value;
  }
  return out;
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
    if (item.isLocal !== undefined && typeof item.isLocal !== "boolean")
      return null;
    // Connection flags — tolerate older hosts that don't send them (= online)
    if (item.connected !== undefined && typeof item.connected !== "boolean")
      return null;
    const until = item.disconnectedUntil ?? null;
    if (until !== null && !isFiniteInt(until)) return null;
    const stats = parseStats(item.stats);
    if (!stats) return null;
    players.push({
      id: item.id,
      name: item.name,
      score: item.score,
      timelineLength: item.timelineLength,
      tokens: item.tokens,
      isLocal: item.isLocal === true,
      stats,
      connected: item.connected !== false,
      disconnectedUntil: until,
    });
  }
  return players;
}

function parseRules(v: unknown): GameRules | null {
  if (!isObject(v) || !isObject(v.buzz)) return null;
  const { enabled, penalty, timerSeconds } = v.buzz;
  if (typeof enabled !== "boolean") return null;
  if (penalty !== "none" && penalty !== "lose-point") return null;
  // Tolerate older hosts that don't send a timer yet
  if (
    timerSeconds !== undefined &&
    (!isFiniteInt(timerSeconds) || timerSeconds <= 0)
  ) {
    return null;
  }

  // Blitz placement timer — tolerate hosts that don't send it (off)
  let placementTimer: number | null = null;
  if (isObject(v.placement) && v.placement.timerSeconds !== undefined) {
    const t = v.placement.timerSeconds;
    if (t !== null && (!isFiniteInt(t) || t <= 0)) return null;
    placementTimer = t as number | null;
  }

  return {
    buzz: {
      enabled,
      penalty,
      timerSeconds: timerSeconds === undefined ? 30 : (timerSeconds as number),
    },
    placement: { timerSeconds: placementTimer },
  };
}

function parseSettings(v: unknown): GameSettings | null {
  if (!isObject(v)) return null;
  if (!isNonNegativeInt(v.winScore) || !isNonNegativeInt(v.maxPlayers))
    return null;
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
  const result: PlacementResult = { correct: v.correct, song };
  if (v.timedOut === true) result.timedOut = true;
  // Optional — an older host simply doesn't say who got the card
  if (v.awardedTo !== undefined) {
    if (!isStringOrNull(v.awardedTo)) return null;
    result.awardedTo = v.awardedTo;
  }
  return result;
}

function parsePlayedSongs(v: unknown): GameState["playedSongs"] | null {
  if (!Array.isArray(v)) return null;
  const out: GameState["playedSongs"] = [];
  for (const item of v) {
    if (!isObject(item)) return null;
    if (typeof item.name !== "string" || typeof item.artist !== "string")
      return null;
    if (!isNonNegativeInt(item.year)) return null;
    out.push({ name: item.name, artist: item.artist, year: item.year });
  }
  return out;
}

// -- Round log --

const ROUND_OUTCOMES: readonly RoundOutcome[] = [
  "placed",
  "timeout",
  "skipped",
  "abandoned",
];

function isIntOrNull(v: unknown): v is number | null {
  return v === null || isNonNegativeInt(v);
}

function parseRoundGuess(v: unknown): RoundGuess | null {
  if (!isObject(v)) return null;
  if (typeof v.title !== "string" || typeof v.artist !== "string") return null;
  if (v.title.length > 1000 || v.artist.length > 1000) return null;
  if (v.year !== null && v.year !== undefined && !isFiniteInt(v.year))
    return null;
  if (
    typeof v.titleCorrect !== "boolean" ||
    typeof v.artistCorrect !== "boolean"
  )
    return null;
  if (
    v.yearCorrect !== null &&
    v.yearCorrect !== undefined &&
    typeof v.yearCorrect !== "boolean"
  )
    return null;
  if (!isNonNegativeInt(v.tokens) || v.tokens > 4) return null;
  return {
    title: v.title,
    artist: v.artist,
    year: typeof v.year === "number" ? v.year : null,
    titleCorrect: v.titleCorrect,
    artistCorrect: v.artistCorrect,
    yearCorrect: typeof v.yearCorrect === "boolean" ? v.yearCorrect : null,
    tokens: v.tokens,
  };
}

function parseRoundBuzz(v: unknown): RoundBuzz | null {
  if (!isObject(v)) return null;
  if (!isNonEmptyString(v.playerId) || typeof v.playerName !== "string")
    return null;
  const position = v.position ?? null;
  if (!isIntOrNull(position)) return null;
  if (typeof v.stolen !== "boolean" || typeof v.penalty !== "boolean")
    return null;
  return {
    playerId: v.playerId,
    playerName: v.playerName,
    position,
    stolen: v.stolen,
    penalty: v.penalty,
  };
}

export function parseRoundRecord(v: unknown): RoundRecord | null {
  if (!isObject(v)) return null;
  if (!isNonNegativeInt(v.round)) return null;
  const song = parseSong(v.song);
  if (!song) return null;
  if (!isNonEmptyString(v.activePlayerId)) return null;
  if (typeof v.activePlayerName !== "string") return null;
  if (
    typeof v.outcome !== "string" ||
    !(ROUND_OUTCOMES as readonly string[]).includes(v.outcome)
  )
    return null;
  const position = v.position ?? null;
  if (!isIntOrNull(position)) return null;
  if (v.correct !== null && v.correct !== undefined && typeof v.correct !== "boolean")
    return null;
  const placeMs = v.placeMs ?? null;
  if (!isIntOrNull(placeMs)) return null;

  let guess: RoundGuess | null = null;
  if (v.guess !== null && v.guess !== undefined) {
    guess = parseRoundGuess(v.guess);
    if (!guess) return null;
  }
  let buzz: RoundBuzz | null = null;
  if (v.buzz !== null && v.buzz !== undefined) {
    buzz = parseRoundBuzz(v.buzz);
    if (!buzz) return null;
  }

  return {
    round: v.round,
    song,
    activePlayerId: v.activePlayerId,
    activePlayerName: v.activePlayerName,
    outcome: v.outcome as RoundOutcome,
    position,
    correct: typeof v.correct === "boolean" ? v.correct : null,
    placeMs,
    guess,
    buzz,
  };
}

export function parseRoundRecords(v: unknown): RoundRecord[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > MAX_ROUNDS_PER_GAME) return null;
  const rounds: RoundRecord[] = [];
  for (const item of v) {
    const round = parseRoundRecord(item);
    if (!round) return null;
    rounds.push(round);
  }
  return rounds;
}

// -- Game recap --
// Travels to every device at the end of a game and is written to local
// storage there, so the bounds below are the only thing between a hostile
// host and an unbounded write on somebody else's phone.

const RECAP_REASONS: readonly RecapReason[] = [
  "win",
  "playlist-exhausted",
  "abandoned",
];

/** A recap with more players than any room could ever hold is not a recap */
const MAX_RECAP_PLAYERS = 32;

function parseRecapPlayer(v: unknown): RecapPlayer | null {
  if (!isObject(v)) return null;
  if (!isNonEmptyString(v.id) || !isNonEmptyString(v.name)) return null;
  if (!isNonNegativeInt(v.score) || !isNonNegativeInt(v.timelineLength))
    return null;
  if (!isNonNegativeInt(v.penalties)) return null;
  if (v.isLocal !== undefined && typeof v.isLocal !== "boolean") return null;
  const stats = parseStats(v.stats);
  if (!stats) return null;
  return {
    id: v.id,
    name: v.name,
    score: v.score,
    timelineLength: v.timelineLength,
    penalties: v.penalties,
    isLocal: v.isLocal === true,
    stats,
  };
}

export function validateGameRecap(v: unknown): GameRecap | null {
  if (!isObject(v)) return null;
  if (!isNonEmptyString(v.roomCode) || !isNonEmptyString(v.hostId)) return null;
  if (!isNonNegativeInt(v.startedAt) || !isNonNegativeInt(v.endedAt))
    return null;
  if (
    typeof v.endedReason !== "string" ||
    !(RECAP_REASONS as readonly string[]).includes(v.endedReason)
  )
    return null;
  if (!isStringOrNull(v.winnerId ?? null)) return null;
  if (!isStringOrNull(v.playlistName ?? null)) return null;
  if (v.demo !== undefined && typeof v.demo !== "boolean") return null;
  if (v.version !== undefined && (!isFiniteInt(v.version) || v.version < 1))
    return null;

  const settings = parseSettings(v.settings);
  const rounds = parseRoundRecords(v.rounds);
  if (!settings || !rounds) return null;

  if (!Array.isArray(v.players) || v.players.length > MAX_RECAP_PLAYERS)
    return null;
  const players: RecapPlayer[] = [];
  for (const item of v.players) {
    const player = parseRecapPlayer(item);
    if (!player) return null;
    players.push(player);
  }

  return {
    version: typeof v.version === "number" ? v.version : RECAP_VERSION,
    roomCode: v.roomCode,
    hostId: v.hostId,
    startedAt: v.startedAt,
    endedAt: v.endedAt,
    endedReason: v.endedReason as RecapReason,
    winnerId: (v.winnerId ?? null) as string | null,
    playlistName: (v.playlistName ?? null) as string | null,
    demo: v.demo === true,
    settings,
    players,
    rounds,
  };
}

// -- Room (snapshot input only) --
// Unlike a GameState this legitimately carries the answers — it is the host's
// own state, restored from local storage after a reload, never wire input.

/** The UNMASKED player, as it lives in Room (not the broadcast PlayerState) */
export function parsePlayerFull(v: unknown): Player | null {
  if (!isObject(v)) return null;
  if (!isNonEmptyString(v.id) || !isNonEmptyString(v.name)) return null;
  if (!isNonNegativeInt(v.score) || !isNonNegativeInt(v.tokens)) return null;
  if (!isNonNegativeInt(v.penalties)) return null;
  if (v.isLocal !== undefined && typeof v.isLocal !== "boolean") return null;
  if (v.connected !== undefined && typeof v.connected !== "boolean") return null;
  const until = v.disconnectedUntil ?? null;
  if (until !== null && !isFiniteInt(until)) return null;
  const timeline = parseSongArray(v.timeline);
  const failedSongs = parseSongArray(v.failedSongs ?? []);
  const stats = parseStats(v.stats);
  if (!timeline || !failedSongs || !stats) return null;
  return {
    id: v.id,
    name: v.name,
    score: v.score,
    timeline,
    tokens: v.tokens,
    failedSongs,
    isLocal: v.isLocal === true,
    penalties: v.penalties,
    stats,
    connected: v.connected !== false,
    disconnectedUntil: until,
  };
}

export function validateRoom(v: unknown): Room | null {
  if (!isObject(v)) return null;
  if (!isNonEmptyString(v.code) || !isNonEmptyString(v.hostId)) return null;
  if (!isPhase(v.phase)) return null;
  if (!Array.isArray(v.players)) return null;

  const players: Player[] = [];
  for (const item of v.players) {
    const player = parsePlayerFull(item);
    if (!player) return null;
    players.push(player);
  }

  const playlist = parseSongArray(v.playlist ?? []);
  const playedSongs = parseSongArray(v.playedSongs ?? []);
  const settings = parseSettings(v.settings);
  const rounds = parseRoundRecords(v.rounds);
  if (!playlist || !playedSongs || !settings || !rounds) return null;

  if (!isNonNegativeInt(v.currentPlayerIndex)) return null;
  if (!isNonNegativeInt(v.playlistTrackCount ?? 0)) return null;

  let currentSong: Song | null = null;
  if (v.currentSong !== null && v.currentSong !== undefined) {
    currentSong = parseSong(v.currentSong);
    if (!currentSong) return null;
  }

  for (const key of ["buzzDeadline", "placeDeadline"] as const) {
    const raw = v[key] ?? null;
    if (raw !== null && !isFiniteInt(raw)) return null;
  }
  if (!isStringOrNull(v.buzzerId ?? null)) return null;
  if (!isStringOrNull(v.playlistName ?? null)) return null;
  if (!isStringOrNull(v.playlistImageUrl ?? null)) return null;
  if (!isStringOrNull(v.playlistId ?? null)) return null;
  if (!isStringOrNull(v.playlistUrl ?? null)) return null;

  if (!Array.isArray(v.passedIds)) return null;
  const passedIds: string[] = [];
  for (const id of v.passedIds) {
    if (!isNonEmptyString(id)) return null;
    passedIds.push(id);
  }

  if (!Array.isArray(v.playedIndices)) return null;
  const playedIndices: number[] = [];
  for (const index of v.playedIndices) {
    if (!isNonNegativeInt(index)) return null;
    playedIndices.push(index);
  }

  return {
    code: v.code,
    hostId: v.hostId,
    players,
    playlist,
    playedSongs,
    currentPlayerIndex: v.currentPlayerIndex,
    currentSong,
    phase: v.phase,
    settings,
    buzzerId: (v.buzzerId ?? null) as string | null,
    buzzDeadline: (v.buzzDeadline ?? null) as number | null,
    placeDeadline: (v.placeDeadline ?? null) as number | null,
    passedIds,
    playlistName: (v.playlistName ?? null) as string | null,
    playlistImageUrl: (v.playlistImageUrl ?? null) as string | null,
    playlistUrl: (v.playlistUrl ?? null) as string | null,
    playlistId: (v.playlistId ?? null) as string | null,
    playlistTrackCount: (v.playlistTrackCount ?? 0) as number,
    playedIndices,
    // Snapshots written before the random-pool feature carry no songSource —
    // derive it so an in-flight game survives the upgrade
    songSource:
      v.songSource === "playlist" ||
      v.songSource === "random" ||
      v.songSource === "demo"
        ? v.songSource
        : v.playlistId
          ? "playlist"
          : "demo",
    rounds,
  };
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
    !isStringOrNull(v.playlistName ?? null) ||
    !isStringOrNull(v.playlistImageUrl ?? null) ||
    !isStringOrNull(v.playlistUrl ?? null)
  ) {
    return null;
  }

  const rawDeadline = v.buzzDeadline ?? null;
  if (rawDeadline !== null && !isFiniteInt(rawDeadline)) return null;
  const buzzDeadline = rawDeadline as number | null;

  const rawPlaceDeadline = v.placeDeadline ?? null;
  if (rawPlaceDeadline !== null && !isFiniteInt(rawPlaceDeadline)) return null;
  const placeDeadline = rawPlaceDeadline as number | null;

  // Host clock stamp — tolerate older hosts that don't send it (offset stays 0).
  // Deliberately NOT bounded by magnitude: a device with a dead battery can be
  // off by years, and that is exactly the case the offset exists to fix.
  const rawHostNow = v.hostNow ?? null;
  if (rawHostNow !== null && (!isFiniteInt(rawHostNow) || rawHostNow <= 0))
    return null;
  const hostNow = rawHostNow as number | null;

  // Broadcast sequence number — tolerate older hosts (peers then can't order
  // states and apply everything, exactly as before)
  const rawStateVersion = v.stateVersion ?? null;
  if (
    rawStateVersion !== null &&
    (!isFiniteInt(rawStateVersion) || rawStateVersion < 0)
  )
    return null;
  const stateVersion = rawStateVersion as number | null;

  const rawPassed = v.passedIds ?? [];
  if (!Array.isArray(rawPassed)) return null;
  const passedIds: string[] = [];
  for (const id of rawPassed) {
    if (!isNonEmptyString(id)) return null;
    passedIds.push(id);
  }

  const rawTrackCount = v.playlistTrackCount ?? 0;
  if (!isNonNegativeInt(rawTrackCount)) return null;
  const playlistTrackCount = rawTrackCount;

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
    const rawYear = v.guessResult.yearCorrect;
    if (rawYear !== undefined && rawYear !== null && typeof rawYear !== "boolean")
      return null;
    guessResult = {
      titleCorrect: v.guessResult.titleCorrect,
      artistCorrect: v.guessResult.artistCorrect,
      yearCorrect: typeof rawYear === "boolean" ? rawYear : null,
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
    buzzDeadline,
    placeDeadline,
    passedIds,
    playlistName: (v.playlistName ?? null) as string | null,
    playlistImageUrl: (v.playlistImageUrl ?? null) as string | null,
    playlistUrl: (v.playlistUrl ?? null) as string | null,
    playlistTrackCount,
    guessResult,
    hostNow,
    stateVersion,
  };
}

export function validateAction(data: unknown): P2PAction | null {
  if (!isObject(data) || typeof data.type !== "string") return null;

  const p = data.payload;

  switch (data.type) {
    case "join":
      if (!isObject(p) || !isNonEmptyString(p.name)) return null;
      return { type: "join", payload: { name: p.name } };

    case "add-local-player":
      if (!isObject(p) || !isNonEmptyString(p.name)) return null;
      return { type: "add-local-player", payload: { name: p.name } };

    case "remove-local-player":
      if (!isObject(p) || !isNonEmptyString(p.playerId)) return null;
      return { type: "remove-local-player", payload: { playerId: p.playerId } };

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

    case "bitster-buzz":
      return { type: "bitster-buzz" };

    case "bitster-pass":
      return { type: "bitster-pass" };

    case "buzz-select":
      if (!isObject(p) || !isNonNegativeInt(p.position)) return null;
      return { type: "buzz-select", payload: { position: p.position } };

    case "buzz-place":
      if (!isObject(p) || !isNonNegativeInt(p.position)) return null;
      return { type: "buzz-place", payload: { position: p.position } };

    case "set-playlist":
      if (!isObject(p) || typeof p.playlistUrl !== "string") return null;
      return { type: "set-playlist", payload: { playlistUrl: p.playlistUrl } };

    case "set-random-pool": {
      // Bounded: the pool rides in the host's room snapshot, which is written
      // to storage on every broadcast
      if (!isObject(p) || !isNonNegativeInt(p.target)) return null;
      if (p.target < MIN_RANDOM_POOL || p.target > MAX_RANDOM_POOL) return null;
      return { type: "set-random-pool", payload: { target: p.target } };
    }

    case "guess-song": {
      if (
        !isObject(p) ||
        typeof p.title !== "string" ||
        typeof p.artist !== "string"
      )
        return null;
      // Optional exact-year bonus guess — sanity-bounded, not game-bounded
      if (
        p.year !== undefined &&
        (!isFiniteInt(p.year) || p.year < 1000 || p.year > 9999)
      )
        return null;
      const payload: { title: string; artist: string; year?: number } = {
        title: p.title,
        artist: p.artist,
      };
      if (p.year !== undefined) payload.year = p.year as number;
      return { type: "guess-song", payload };
    }

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

    case "game-recap": {
      const recap = validateGameRecap(p);
      if (!recap) return null;
      return { type: "game-recap", payload: recap };
    }

    case "error":
      if (!isObject(p) || typeof p.message !== "string") return null;
      return { type: "error", payload: { message: p.message } };

    default:
      return null;
  }
}
