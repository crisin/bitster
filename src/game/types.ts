export type Phase =
  | "lobby"
  | "playing"
  | "bitster-window"
  | "reveal"
  | "finished";

export interface Song {
  id: string;
  uri: string;
  name: string;
  artist: string;
  year: number;
  imageUrl?: string;
  /** Track length in ms (provider metadata, optional) */
  durationMs?: number;
  /** Provider's explicit-lyrics flag */
  explicit?: boolean;
  /** Provider popularity 0-100 (Spotify) — fuels Deep Cut / Banger badges */
  popularity?: number;
  albumName?: string;
}

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
  // Lazy loading — fetch songs on demand instead of loading entire playlist
  playlistId: string | null;
  playlistTrackCount: number;
  playedIndices: number[];
}

export interface PlacementResult {
  correct: boolean;
  song: Song;
  /** True when the active player ran out of time instead of placing (Blitz) */
  timedOut?: boolean;
}

export interface PlayerState {
  id: string;
  name: string;
  score: number;
  timelineLength: number;
  tokens: number;
  isLocal: boolean;
  stats: PlayerStats;
}

export interface GuessResult {
  titleCorrect: boolean;
  artistCorrect: boolean;
  /** null = no year guessed this round */
  yearCorrect: boolean | null;
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
  playlistTrackCount: number;
  guessResult: GuessResult | null;
}
