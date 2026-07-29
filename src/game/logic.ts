import type {
  GameRecap,
  GameSettings,
  GameState,
  GameStateMeta,
  GuessResult,
  GuessRules,
  PlacementResult,
  Player,
  RecapReason,
  Room,
  RoundGuess,
  RoundRecord,
  Song,
} from "./types";
import { maskSecrets } from "@/schema/song";
import {
  DEFAULT_RULES,
  DEFAULT_SETTINGS,
  EMPTY_STATS,
  MAX_GUESS_TEXT,
  MAX_ROUND_ENTRIES,
  MAX_ROUNDS_PER_GAME,
  RECAP_VERSION,
} from "./types";

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
  settings?: Partial<GameSettings>,
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
    settings: {
      ...DEFAULT_SETTINGS,
      ...settings,
      // Deep-merge rules — a partial rules object must not wipe the defaults
      rules: {
        ...DEFAULT_RULES,
        ...settings?.rules,
        buzz: { ...DEFAULT_RULES.buzz, ...settings?.rules?.buzz },
        placement: {
          ...DEFAULT_RULES.placement,
          ...settings?.rules?.placement,
        },
        skip: { ...DEFAULT_RULES.skip, ...settings?.rules?.skip },
        guess: { ...DEFAULT_RULES.guess, ...settings?.rules?.guess },
        tokens: { ...DEFAULT_RULES.tokens, ...settings?.rules?.tokens },
      },
    },
    buzzerId: null,
    buzzDeadline: null,
    placeDeadline: null,
    passedIds: [],
    playlistName: null,
    playlistImageUrl: null,
    playlistUrl: null,
    playlistId: null,
    playlistTrackCount: 0,
    playedIndices: [],
    songSource: "demo",
    rounds: [],
  };
}

/** Fallback for a player created before any settings exist (room creation) */
const STARTING_TOKENS = DEFAULT_RULES.tokens.start;

function createPlayer(id: string, name: string, isLocal = false): Player {
  return {
    id,
    name,
    score: 0,
    timeline: [],
    tokens: STARTING_TOKENS,
    failedSongs: [],
    isLocal,
    penalties: 0,
    stats: { ...EMPTY_STATS },
    connected: true,
    disconnectedUntil: null,
  };
}

/**
 * Score = timeline length minus collected buzz penalties. Deriving it in one
 * place keeps penalties durable — recomputations after placements/undos used
 * to silently erase them.
 */
function scoreOf(timeline: Song[], penalties: number): number {
  return Math.max(0, timeline.length - penalties);
}

/**
 * Settle every score from what is actually on the timelines. Called when a
 * round resolves: placements are tentative until the reveal, so placeSong
 * deliberately does NOT touch the score — this is the single place where the
 * number catches up with the verdict.
 */
export function recomputeScores(room: Room): Room {
  return {
    ...room,
    players: room.players.map((p) => ({
      ...p,
      score: scoreOf(p.timeline, p.penalties),
    })),
  };
}

export function addPlayer(
  room: Room,
  id: string,
  name: string,
  isLocal = false,
): Room {
  // Same peer ID reconnecting — keep their seat, refresh the name and clear the
  // disconnect grace. This is the seat-recovery path after a dropped socket.
  const existingById = room.players.find((p) => p.id === id);
  if (existingById) {
    return {
      ...room,
      players: room.players.map((p) =>
        p.id === id
          ? { ...p, name, connected: true, disconnectedUntil: null }
          : p,
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
    players: [...room.players, createPlayer(id, name, isLocal)],
  };
}

/**
 * Flag a player's socket as alive or inside the disconnect grace. Local
 * (pass-and-play) players have no socket of their own and are always connected;
 * unknown ids are a no-op.
 */
export function setPlayerConnected(
  room: Room,
  playerId: string,
  connected: boolean,
  until: number | null,
): Room {
  const player = room.players.find((p) => p.id === playerId);
  if (!player || player.isLocal) return room;
  return {
    ...room,
    players: room.players.map((p) =>
      p.id === playerId
        ? { ...p, connected, disconnectedUntil: connected ? null : until }
        : p,
    ),
  };
}

/**
 * True when somebody other than the active player could still buzz. Without a
 * live challenger the bitster-window would hang: allChallengersPassed is false
 * as long as nobody has passed, and nothing else resolves the phase.
 */
export function hasLiveChallengers(room: Room): boolean {
  const currentId = getCurrentPlayer(room)?.id;
  return room.players.some(
    (p) => p.id !== currentId && p.connected && p.tokens > 0,
  );
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
    buzzDeadline: room.buzzerId === playerId ? null : room.buzzDeadline,
    passedIds: room.passedIds.filter((id) => id !== playerId),
  };
}

export function pickRandomSong(room: Room): { room: Room; song: Song } | null {
  const available = room.playlist.filter(
    (s) => !room.playedSongs.some((ps) => ps.id === s.id),
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

export function setSongFromIndex(room: Room, song: Song, index: number): Room {
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
  position: number,
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
  position: number,
): { room: Room; result: PlacementResult } {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");
  if (!room.currentSong) throw new Error("No current song");
  if (position < 0 || position > player.timeline.length)
    throw new Error("Invalid position");

  const song = room.currentSong;
  const correct = checkPlacement(player.timeline, song, position);

  // Always insert card (tentatively) — removed during reveal if wrong
  const updatedTimeline = [
    ...player.timeline.slice(0, position),
    song,
    ...player.timeline.slice(position),
  ];

  // The card is only TENTATIVE until the reveal — the score must not credit
  // it yet, or the scoreboard flashes a point that a wrong placement never
  // earned. The timeline shows the card (that is the point of the window);
  // recomputeScores settles the number when the verdict lands.
  const updatedPlayers = room.players.map((p) =>
    p.id === playerId ? { ...p, timeline: updatedTimeline } : p,
  );

  return {
    room: {
      ...room,
      players: updatedPlayers,
      phase: "bitster-window",
      passedIds: [],
      buzzDeadline: null,
      placeDeadline: null,
    },
    result: { correct, song },
  };
}

/**
 * Blitz mode: the active player ran out of time. No card is placed — the song
 * goes straight to their failed pile and the round jumps to reveal.
 */
export function forfeitPlacement(room: Room): {
  room: Room;
  result: PlacementResult;
} {
  const player = getCurrentPlayer(room);
  if (!player) throw new Error("No active player");
  if (!room.currentSong) throw new Error("No current song");

  const song = room.currentSong;
  const updatedPlayers = room.players.map((p) =>
    p.id === player.id
      ? { ...p, failedSongs: [...p.failedSongs, song] }
      : p,
  );

  return {
    room: {
      ...room,
      players: updatedPlayers,
      phase: "reveal",
      buzzerId: null,
      buzzDeadline: null,
      placeDeadline: null,
      passedIds: [],
    },
    result: { correct: false, song, timedOut: true },
  };
}

/** Remove a tentatively placed song from a player's timeline and track it as failed. */
export function undoPlacement(
  room: Room,
  playerId: string,
  songId: string,
): Room {
  const updatedPlayers = room.players.map((p) => {
    if (p.id !== playerId) return p;
    const failed = p.timeline.find((s) => s.id === songId);
    const newTimeline = p.timeline.filter((s) => s.id !== songId);
    return {
      ...p,
      timeline: newTimeline,
      score: scoreOf(newTimeline, p.penalties),
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
    buzzDeadline: null,
    placeDeadline: null,
    passedIds: [],
  };
}

/** Award bonus tokens (guess rewards) and count them in the player's stats */
export function awardTokens(room: Room, playerId: string, count: number): Room {
  if (count <= 0) return room;
  const updatedPlayers = room.players.map((p) =>
    p.id === playerId
      ? {
          ...p,
          tokens: p.tokens + count,
          stats: { ...p.stats, guessTokens: p.stats.guessTokens + count },
        }
      : p,
  );
  return { ...room, players: updatedPlayers };
}

/** Bump one stat counter on one player */
export function bumpStat(
  room: Room,
  playerId: string,
  stat: keyof Player["stats"],
): Room {
  const updatedPlayers = room.players.map((p) =>
    p.id === playerId
      ? { ...p, stats: { ...p.stats, [stat]: p.stats[stat] + 1 } }
      : p,
  );
  return { ...room, players: updatedPlayers };
}

/**
 * Append one finished round to the log. The round NUMBER is stamped here so
 * callers cannot drift it, and the user-supplied text is capped here so no
 * caller can forget to.
 */
export function appendRound(
  room: Room,
  record: Omit<RoundRecord, "round">,
): Room {
  // A pathological game must not grow the room state without bound
  if (room.rounds.length >= MAX_ROUNDS_PER_GAME) return room;

  const guess: RoundGuess | null = record.guess
    ? {
        ...record.guess,
        title: record.guess.title.trim().slice(0, MAX_GUESS_TEXT),
        artist: record.guess.artist.trim().slice(0, MAX_GUESS_TEXT),
      }
    : null;

  const placeMs =
    record.placeMs !== null &&
    Number.isFinite(record.placeMs) &&
    record.placeMs >= 0
      ? Math.round(record.placeMs)
      : null;

  const stamped: RoundRecord = {
    ...record,
    round: room.rounds.length + 1,
    activePlayerName: record.activePlayerName.slice(0, 24),
    guess,
    placeMs,
    buzz: record.buzz
      ? { ...record.buzz, playerName: record.buzz.playerName.slice(0, 24) }
      : null,
    // The event arrays are bounded by the game itself (pick attempts, players
    // in a room) — capping here is what makes that true for the STORED record
    // as well, whatever a caller hands in.
    tokens: record.tokens.slice(0, MAX_ROUND_ENTRIES).map((t) => ({
      ...t,
      playerName: t.playerName.slice(0, 24),
    })),
    rerolls: record.rerolls.slice(0, MAX_ROUND_ENTRIES),
    passes: record.passes.slice(0, MAX_ROUND_ENTRIES).map((p) => ({
      ...p,
      playerName: p.playerName.slice(0, 24),
    })),
  };

  return { ...room, rounds: [...room.rounds, stamped] };
}

/**
 * The end-of-game payload. `endedReason` is INJECTED rather than derived: only
 * the caller knows why the phase flipped, and a game that ended because
 * everyone left can still contain a player at or above the win score.
 */
export function buildGameRecap(
  room: Room,
  opts: {
    startedAt: number;
    endedAt: number;
    endedReason: RecapReason;
    demo: boolean;
  },
): GameRecap {
  let winnerId: string | null = null;
  if (opts.endedReason === "win") {
    winnerId = checkWinCondition(room)?.id ?? null;
  } else if (opts.endedReason === "playlist-exhausted") {
    // Highest score takes it — unless it is a tie, which nobody wins
    const ranked = [...room.players].sort((a, b) => b.score - a.score);
    if (ranked.length > 0 && (ranked.length === 1 || ranked[0].score > ranked[1].score)) {
      winnerId = ranked[0].id;
    }
  }

  return {
    version: RECAP_VERSION,
    roomCode: room.code,
    hostId: room.hostId,
    startedAt: opts.startedAt,
    endedAt: opts.endedAt,
    endedReason: opts.endedReason,
    winnerId,
    playlistName: room.playlistName,
    demo: opts.demo,
    settings: room.settings,
    // Timelines and failed piles stay out — the round log already holds every
    // song, and a recap travels to every device.
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      timelineLength: p.timeline.length,
      penalties: p.penalties,
      isLocal: p.isLocal,
      stats: p.stats,
    })),
    rounds: room.rounds,
  };
}

export function checkWinCondition(room: Room): Player | null {
  return room.players.find((p) => p.score >= room.settings.winScore) ?? null;
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
  // Starting tokens are applied HERE rather than at join: the host may still be
  // changing the mode while people trickle in, and everyone must start equal.
  const resetPlayers = room.players.map((p) => ({
    ...p,
    score: 0,
    timeline: [],
    tokens: room.settings.rules.tokens.start,
    failedSongs: [],
    penalties: 0,
    stats: { ...EMPTY_STATS },
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
    buzzDeadline: null,
    placeDeadline: null,
    passedIds: [],
    playlistName: playlistName ?? room.playlistName,
    playlistId: playlistId ?? null,
    playlistTrackCount: playlistTrackCount ?? 0,
    playedIndices: [],
    rounds: [],
  };
}

/**
 * Is there anything to challenge at all? A card dropped into an EMPTY timeline
 * is correct by definition (checkPlacement returns true), so a buzz against it
 * can never win — it would only burn a token. The disputed card is already in
 * the timeline at this point, so "at least two" means "they had one before".
 */
export function canBeChallenged(room: Room): boolean {
  const current = getCurrentPlayer(room);
  return (current?.timeline.length ?? 0) >= 2;
}

export function handleBuzz(room: Room, buzzerId: string): Room {
  if (!room.settings.rules.buzz.enabled) return room;
  if (!canBeChallenged(room)) return room;
  if (room.buzzerId) return room;
  const currentPlayer = getCurrentPlayer(room);
  if (currentPlayer?.id === buzzerId) return room;
  if (room.passedIds.includes(buzzerId)) return room;
  const buzzer = room.players.find((p) => p.id === buzzerId);
  if (!buzzer) return room;
  if (buzzer.tokens <= 0) return room;

  // Spend a token
  const updatedPlayers = room.players.map((p) =>
    p.id === buzzerId ? { ...p, tokens: p.tokens - 1 } : p,
  );

  return { ...room, players: updatedPlayers, buzzerId };
}

/** A non-active player declares "no bitster" for this window — binding. */
export function recordPass(room: Room, playerId: string): Room {
  if (room.phase !== "bitster-window") return room;
  if (getCurrentPlayer(room)?.id === playerId) return room;
  if (room.buzzerId === playerId) return room;
  if (room.passedIds.includes(playerId)) return room;
  if (!room.players.some((p) => p.id === playerId)) return room;
  return { ...room, passedIds: [...room.passedIds, playerId] };
}

/**
 * True when every player who could still buzz has explicitly passed.
 * Players without tokens can't challenge anyway, and neither can players whose
 * socket is gone — the window must not wait for a pass that can never arrive.
 * Requires at least one actual pass so an all-broke lobby doesn't skip the
 * window instantly.
 */
export function allChallengersPassed(room: Room): boolean {
  if (room.buzzerId) return false;
  if (room.passedIds.length === 0) return false;
  const currentId = getCurrentPlayer(room)?.id;
  const eligible = room.players.filter(
    (p) => p.id !== currentId && p.tokens > 0 && p.connected,
  );
  return eligible.every((p) => room.passedIds.includes(p.id));
}

/** Insert a song into a timeline at its chronologically correct spot. */
function insertChronologically(timeline: Song[], song: Song): Song[] {
  const index = timeline.findIndex((s) => s.year > song.year);
  const at = index === -1 ? timeline.length : index;
  return [...timeline.slice(0, at), song, ...timeline.slice(at)];
}

/**
 * Resolve the buzzer's counter-placement. `position` is a gap in the ACTIVE
 * player's timeline (with the disputed card already removed) — the buzzer
 * claims that's where the song really belongs. If they're right, the card
 * lands in the buzzer's own timeline at the chronologically correct spot.
 */
export function resolveBuzz(
  room: Room,
  position: number,
): { room: Room; result: PlacementResult } {
  if (!room.buzzerId || !room.currentSong) {
    throw new Error("No active buzz");
  }

  const buzzer = room.players.find((p) => p.id === room.buzzerId);
  if (!buzzer) throw new Error("Buzzer player not found");
  const target = getCurrentPlayer(room);
  if (!target) throw new Error("No active player");
  if (position < 0 || position > target.timeline.length)
    throw new Error("Invalid position");

  const song = room.currentSong;
  const correct = checkPlacement(target.timeline, song, position);

  const updatedPlayers = room.players.map((p) => {
    if (p.id !== room.buzzerId) return p;
    if (correct) {
      const newTimeline = insertChronologically(p.timeline, song);
      return {
        ...p,
        timeline: newTimeline,
        score: scoreOf(newTimeline, p.penalties),
        stats: { ...p.stats, buzzWins: p.stats.buzzWins + 1 },
      };
    }
    // A penalty is durable: it lives in `penalties` and flows into every
    // future score recomputation instead of being a one-off decrement.
    const penalties =
      room.settings.rules.buzz.penalty === "lose-point"
        ? p.penalties + 1
        : p.penalties;
    return {
      ...p,
      penalties,
      score: scoreOf(p.timeline, penalties),
      stats: { ...p.stats, buzzFails: p.stats.buzzFails + 1 },
    };
  });

  return {
    room: { ...room, players: updatedPlayers, buzzerId: null, phase: "reveal" },
    result: { correct, song },
  };
}

/**
 * Optimal-string-alignment distance: Levenshtein plus adjacent transpositions
 * counting as one edit (so "teh" → "the" is 1, not 2).
 */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prevPrev = new Array<number>(n + 1).fill(0);
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        curr[j] = Math.min(curr[j], prevPrev[j - 2] + 1); // transposition
      }
    }
    [prevPrev, prev, curr] = [prev, curr, prevPrev];
  }
  return prev[n];
}

/**
 * How many typos to forgive, based on the longer string. Short strings stay
 * strict — with 4 characters a single edit reaches a different word entirely.
 */
function typoTolerance(length: number): number {
  if (length <= 4) return 0;
  if (length <= 8) return 1;
  if (length <= 12) return 2;
  return 3;
}

/** Equality with length-scaled typo tolerance on normalized strings */
function fuzzyEquals(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 0 || b.length === 0) return false;
  const tolerance = typoTolerance(Math.max(a.length, b.length));
  if (tolerance === 0) return false;
  if (Math.abs(a.length - b.length) > tolerance) return false;
  return editDistance(a, b) <= tolerance;
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

/** Check if a guessed title matches the actual title (fuzzy, typo-tolerant) */
function checkTitleMatch(guess: string, actual: string): boolean {
  const g = normalize(guess);
  const a = normalize(actual);
  if (g.length === 0) return false;
  if (fuzzyEquals(g, a)) return true;
  // Try with stripped suffixes (handles remixes, feat. tags, edition labels)
  const gStripped = normalize(stripTitleSuffix(guess));
  const aStripped = normalize(stripTitleSuffix(actual));
  if (
    gStripped.length > 0 &&
    aStripped.length > 0 &&
    fuzzyEquals(gStripped, aStripped)
  )
    return true;
  return false;
}

/** Check if a guessed artist matches any of the actual artists (fuzzy, typo-tolerant) */
function checkArtistMatch(guess: string, actual: string): boolean {
  if (normalize(guess).length === 0) return false;

  const actualParts = splitArtists(actual);
  const guessParts = splitArtists(guess);

  if (actualParts.length === 0 || guessParts.length === 0) {
    return fuzzyEquals(normalize(guess), normalize(actual));
  }

  // Any guess part matches any actual part (typo-tolerant)
  if (guessParts.some((g) => actualParts.some((a) => fuzzyEquals(g, a))))
    return true;

  // Containment: actual artist found within a guess part (handles "eminemrihanna" containing "eminem")
  if (
    guessParts.some((g) =>
      actualParts.some((a) => a.length >= 3 && g.includes(a)),
    )
  )
    return true;

  // Reverse containment: guess part found within an actual artist name
  if (
    guessParts.some(
      (g) => g.length >= 3 && actualParts.some((a) => a.includes(g)),
    )
  )
    return true;

  return false;
}

/**
 * Pure guess evaluation — no state change. Token rewards (+1 for title AND
 * artist, +1 extra for the exact year) are applied by the host AT REVEAL via
 * awardTokens, so the broadcast token count can't leak the verdict early.
 */
export function evaluateGuess(
  room: Room,
  guessTitle: string,
  guessArtist: string,
  guessYear?: number,
): GuessResult {
  if (!room.currentSong) throw new Error("No current song");

  const titleCorrect = checkTitleMatch(guessTitle, room.currentSong.name);
  const artistCorrect = checkArtistMatch(guessArtist, room.currentSong.artist);
  // Tolerance is a rule, not a fudge factor: at 0 this is an exact match
  const tolerance = Math.max(0, room.settings.rules.guess.yearTolerance);
  const yearCorrect =
    guessYear === undefined
      ? null
      : Math.abs(guessYear - room.currentSong.year) <= tolerance;

  return { titleCorrect, artistCorrect, yearCorrect };
}

/** True when the guessed parts satisfy the configured difficulty */
export function guessSongCorrect(
  result: GuessResult,
  rules: GuessRules,
): boolean {
  switch (rules.require) {
    case "either":
      return result.titleCorrect || result.artistCorrect;
    case "title":
      return result.titleCorrect;
    case "artist":
      return result.artistCorrect;
    case "both":
      return result.titleCorrect && result.artistCorrect;
  }
}

/**
 * Tokens a guess is worth under the current rules: one for the song (whatever
 * the difficulty demands of it) and one more for the year.
 */
export function guessReward(result: GuessResult, rules: GuessRules): number {
  return (
    (guessSongCorrect(result, rules) ? 1 : 0) +
    (rules.yearBonus && result.yearCorrect === true ? 1 : 0)
  );
}

/**
 * Reroll: throw this song away and take another. The cost comes from the rules,
 * so a mode can make it free (0) or ban it outright — the caller checks
 * `rules.skip.enabled`, this function only refuses what it cannot pay for.
 */
export function skipSong(room: Room, playerId: string): Room {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");
  const cost = room.settings.rules.skip.cost;
  if (player.tokens < cost) throw new Error("No tokens to spend");

  const updatedPlayers = room.players.map((p) =>
    p.id === playerId
      ? {
          ...p,
          tokens: p.tokens - cost,
          stats: { ...p.stats, skips: p.stats.skips + 1 },
        }
      : p,
  );

  return { ...room, players: updatedPlayers };
}

export function buildGameState(room: Room, meta: GameStateMeta): GameState {
  const currentPlayer = getCurrentPlayer(room);

  // While the current song is still being guessed/challenged, its metadata must
  // not reach the peers: it IS the answer (title/artist for the guess, year for
  // the placement). It appears in playedSongs and timelines only from reveal on.
  // Which fields betray it is declared in src/schema/song.ts, not here.
  const secretSongId =
    room.phase === "playing" || room.phase === "bitster-window"
      ? (room.currentSong?.id ?? null)
      : null;

  const timelines: Record<string, Song[]> = {};
  const failedTimelines: Record<string, Song[]> = {};
  for (const p of room.players) {
    timelines[p.id] = secretSongId
      ? p.timeline.map((s) => (s.id === secretSongId ? maskSecrets(s) : s))
      : p.timeline;
    failedTimelines[p.id] = p.failedSongs;
  }

  // NOTE: room.rounds is deliberately absent from the broadcast. It holds the
  // real year of every song played so far, including skipped and timed-out ones
  // that were never revealed — spreading the room in here would leak the answers.
  return {
    roomCode: room.code,
    phase: room.phase,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      timelineLength: p.timeline.length,
      tokens: p.tokens,
      isLocal: p.isLocal,
      stats: p.stats,
      connected: p.connected,
      disconnectedUntil: p.disconnectedUntil,
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
    buzzDeadline: room.buzzDeadline,
    placeDeadline: room.placeDeadline,
    passedIds: room.passedIds,
    playlistName: room.playlistName,
    playlistImageUrl: room.playlistImageUrl,
    playlistUrl: room.playlistUrl,
    playlistTrackCount: room.playlistTrackCount,
    guessResult: null,
    hostNow: meta.hostNow,
    stateVersion: meta.stateVersion,
  };
}
