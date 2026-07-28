import type { SongShape } from "@/schema/song";

export type Phase =
  | "lobby"
  | "playing"
  | "bitster-window"
  | "reveal"
  | "finished";

/**
 * Provider-agnostic song. The fields — including which of them betray the
 * answer — are declared once in src/schema/song.ts and derived from there.
 */
export interface Song extends SongShape {}

/** Per-game fun stats, tracked by the host and shown on the finished screen */
export interface PlayerStats {
  placedCorrect: number;
  placedWrong: number;
  buzzWins: number;
  buzzFails: number;
  /** Tokens earned via title/artist/year guesses */
  guessTokens: number;
  skips: number;
}

export const EMPTY_STATS: PlayerStats = {
  placedCorrect: 0,
  placedWrong: 0,
  buzzWins: 0,
  buzzFails: 0,
  guessTokens: 0,
  skips: 0,
};

export interface Player {
  id: string;
  name: string;
  score: number;
  timeline: Song[];
  tokens: number;
  /** Songs the player placed incorrectly (removed during reveal) */
  failedSongs: Song[];
  /** Plays on the host's device (pass-and-play) instead of their own connection */
  isLocal: boolean;
  /** Buzz penalties collected ("lose-point" rule) — score = timeline.length - penalties */
  penalties: number;
  stats: PlayerStats;
  /** Socket is alive. False = inside the disconnect grace, still a player. */
  connected: boolean;
  /**
   * Epoch ms at which the disconnect grace expires — null while connected.
   * Absolute (like buzzDeadline) so it survives a host reload unchanged.
   */
  disconnectedUntil: number | null;
}

export interface BuzzRules {
  enabled: boolean;
  penalty: "none" | "lose-point";
  /** Seconds the buzzer has to lock in their placement */
  timerSeconds: number;
}

export interface PlacementRules {
  /** Blitz mode: seconds the active player has to place — null = no limit */
  timerSeconds: number | null;
}

export interface GameRules {
  buzz: BuzzRules;
  placement: PlacementRules;
}

export const BUZZ_TIMER_OPTIONS = [15, 30, 45, 60] as const;
export const DEFAULT_BUZZ_TIMER_SECONDS = 30;

/** Blitz-mode choices — null renders as "Off" */
export const PLACEMENT_TIMER_OPTIONS = [null, 10, 20, 30] as const;

export const DEFAULT_RULES: GameRules = {
  buzz: {
    enabled: true,
    penalty: "none",
    timerSeconds: DEFAULT_BUZZ_TIMER_SECONDS,
  },
  placement: {
    timerSeconds: null,
  },
};

export interface GameSettings {
  winScore: number;
  maxPlayers: number;
  rules: GameRules;
}

export const DEFAULT_SETTINGS: GameSettings = {
  winScore: 10,
  maxPlayers: 8,
  rules: DEFAULT_RULES,
};

/**
 * Where this game's songs come from. Decides both the lobby wording and
 * whether the game counts towards the all-time stats — a demo round with mock
 * songs must not, a random-library game must.
 */
export type SongSource = "playlist" | "random" | "demo";

/** Bounds for a random pool — it lives in the host's snapshot, so it is capped */
export const MIN_RANDOM_POOL = 10;
export const MAX_RANDOM_POOL = 120;
export const DEFAULT_RANDOM_POOL = 60;

export interface Room {
  code: string;
  hostId: string;
  players: Player[];
  playlist: Song[];
  playedSongs: Song[];
  currentPlayerIndex: number;
  currentSong: Song | null;
  phase: Phase;
  settings: GameSettings;
  buzzerId: string | null;
  /** Epoch ms until which the buzzer may lock in — null when no buzz is running */
  buzzDeadline: number | null;
  /** Blitz mode: epoch ms until which the active player must place — null = no limit */
  placeDeadline: number | null;
  /** Players who declared "no bitster" for the current window */
  passedIds: string[];
  playlistName: string | null;
  playlistImageUrl: string | null;
  /** Canonical share link, kept so the end screen can hand it round */
  playlistUrl: string | null;
  // Lazy loading — fetch songs on demand instead of loading entire playlist
  playlistId: string | null;
  playlistTrackCount: number;
  playedIndices: number[];
  songSource: SongSource;
  /**
   * Append-only log of the rounds played so far. Host-side only — it holds the
   * REAL year of every song, including ones that were skipped or timed out and
   * therefore never revealed. It must never enter buildGameState().
   */
  rounds: RoundRecord[];
}

export interface PlacementResult {
  correct: boolean;
  song: Song;
  /** True when the active player ran out of time instead of placing (Blitz) */
  timedOut?: boolean;
  /**
   * Whose timeline the card ended up in — the active player, the buzzer who
   * stole it, or nobody. Set by the host at the reveal, once the buzz is
   * resolved. Absent from older hosts.
   */
  awardedTo?: string | null;
}

// -- Round log --
// Written by the host as each round ends; the basis for the end screen, the
// end-of-game recap and the local history on every device.

export type RoundOutcome = "placed" | "timeout" | "skipped" | "abandoned";

/** What the active player typed, plus the verdict and the reward it earned */
export interface RoundGuess {
  /** As typed, trimmed to MAX_GUESS_TEXT */
  title: string;
  artist: string;
  /** null = no year guessed this round */
  year: number | null;
  titleCorrect: boolean;
  artistCorrect: boolean;
  yearCorrect: boolean | null;
  /** Tokens actually awarded (0 when the round never reached the reveal) */
  tokens: number;
}

export interface RoundBuzz {
  playerId: string;
  /** Snapshot — the buzzer may have left by the time the log is read */
  playerName: string;
  /** Gap the buzzer claimed; null = the timer ran out without a pick */
  position: number | null;
  /** True when the steal worked and the card moved into the buzzer's timeline */
  stolen: boolean;
  /** True when the "lose-point" rule fired on this buzz */
  penalty: boolean;
}

/**
 * Why a token moved. Tokens are the bitster currency: spent to buzz or skip,
 * earned by guessing — and `delta` says which, so a reader never has to know
 * the sign convention of each reason.
 */
export type TokenReason = "guess-song" | "guess-year" | "skip" | "buzz";

export interface RoundToken {
  playerId: string;
  /** Snapshot — the player may have left by the time the log is read */
  playerName: string;
  /** +1 earned, −1 spent */
  delta: number;
  reason: TokenReason;
}

/**
 * A playlist slot that never became a round. Recorded because a song silently
 * vanishing is otherwise indistinguishable from a small playlist — and because
 * these counts are what decides whether the re-roll work in PLAN.md (P5) is
 * worth doing.
 */
export type RerollReason = "unplayable" | "unusable" | "fetch-retry";

export interface RoundReroll {
  /** The playlist slot, so a specific dead track stays findable */
  index: number;
  reason: RerollReason;
}

/** Someone who explicitly waved the placement through instead of buzzing */
export interface RoundPass {
  playerId: string;
  playerName: string;
}

export interface RoundRecord {
  /** 1-based, counts every round including skips and aborts */
  round: number;
  /** Always the REAL song, never the masked one */
  song: Song;
  activePlayerId: string;
  activePlayerName: string;
  outcome: RoundOutcome;
  /** Gap the active player chose — null for timeout/skip/abandon */
  position: number | null;
  /** Placement verdict; null when no placement happened */
  correct: boolean | null;
  /** ms from song start to placement/skip — null when unknown */
  placeMs: number | null;
  guess: RoundGuess | null;
  buzz: RoundBuzz | null;
  /** Every token that moved this round, in the order it moved */
  tokens: RoundToken[];
  /** Slots thrown away while hunting for THIS round's song */
  rerolls: RoundReroll[];
  /** Who passed in the bitster window (empty unless the window ran) */
  passes: RoundPass[];
}

/**
 * Cap for the per-round event arrays. Each one is naturally bounded (pick
 * attempts, players in a room), so this is purely the wire guard: a hostile
 * host must not be able to grow a recap without limit.
 */
export const MAX_ROUND_ENTRIES = 16;

export type RecapReason = "win" | "playlist-exhausted" | "abandoned";

export interface RecapPlayer {
  /** Peer id or `local-…` — NEVER a streaming account id */
  id: string;
  name: string;
  score: number;
  timelineLength: number;
  penalties: number;
  isLocal: boolean;
  stats: PlayerStats;
}

/**
 * End-of-game payload: broadcast to every peer and stored locally.
 * Only ever produced once the game is over — it contains every real year.
 */
export interface GameRecap {
  /** Wire schema version of the recap payload */
  version: number;
  roomCode: string;
  hostId: string;
  startedAt: number;
  endedAt: number;
  endedReason: RecapReason;
  winnerId: string | null;
  playlistName: string | null;
  /** True for the mock/demo playlist — excluded from all-time stats by default */
  demo: boolean;
  settings: GameSettings;
  players: RecapPlayer[];
  rounds: RoundRecord[];
}

export const RECAP_VERSION = 1;
/** Hard bound so a pathological game can't grow the room state without limit */
export const MAX_ROUNDS_PER_GAME = 200;
/** Guess text is user input from the wire — cap it before it is stored */
export const MAX_GUESS_TEXT = 64;

export interface PlayerState {
  id: string;
  name: string;
  score: number;
  timelineLength: number;
  tokens: number;
  isLocal: boolean;
  stats: PlayerStats;
  /** False = their socket dropped and the disconnect grace is running */
  connected: boolean;
  /** Epoch ms (host clock) at which the grace expires — null while connected */
  disconnectedUntil: number | null;
}

export interface GuessResult {
  titleCorrect: boolean;
  artistCorrect: boolean;
  /** null = no year guessed this round */
  yearCorrect: boolean | null;
}

/**
 * Transport metadata stamped by the host on every outgoing game-state.
 * Injected into buildGameState so game/logic.ts stays free of clock reads.
 */
export interface GameStateMeta {
  /** The host's Date.now() at the moment the state was built */
  hostNow: number;
  /** Monotonic per-message counter (see HostSession.stateVersion) */
  stateVersion: number;
}

export interface GameState {
  roomCode: string;
  phase: Phase;
  players: PlayerState[];
  currentPlayerId: string | null;
  currentSongUri: string | null;
  currentSongId: string | null;
  timelines: Record<string, Song[]>;
  /** Songs each player placed incorrectly (keyed by player ID) */
  failedTimelines: Record<string, Song[]>;
  lastResult: PlacementResult | null;
  hostId: string;
  settings: GameSettings;
  playedSongs: { name: string; artist: string; year: number }[];
  buzzerId: string | null;
  buzzDeadline: number | null;
  placeDeadline: number | null;
  passedIds: string[];
  playlistName: string | null;
  playlistImageUrl: string | null;
  /** Share link for the playlist — null for a random mix or the demo game */
  playlistUrl: string | null;
  playlistTrackCount: number;
  guessResult: GuessResult | null;
  /**
   * The host's clock (epoch ms) when this state was built. Peers derive their
   * clock offset from it so buzzDeadline/placeDeadline render against their own
   * clock. null = an older host that doesn't send it.
   */
  hostNow: number | null;
  /**
   * Strictly increasing across every state the host sends. Peers drop states
   * with a version <= the last one they applied. null = an older host.
   */
  stateVersion: number | null;
}
