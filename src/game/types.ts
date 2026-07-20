export type Phase = "lobby" | "playing" | "hitster-window" | "reveal" | "finished";

export interface Song {
  id: string;
  uri: string;
  name: string;
  artist: string;
  year: number;
  imageUrl?: string;
}

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
}

export interface BuzzRules {
  enabled: boolean;
  penalty: "none" | "lose-point";
  /** Seconds the buzzer has to lock in their placement */
  timerSeconds: number;
}

export interface GameRules {
  buzz: BuzzRules;
}

export const BUZZ_TIMER_OPTIONS = [15, 30, 45, 60] as const;
export const DEFAULT_BUZZ_TIMER_SECONDS = 30;

export const DEFAULT_RULES: GameRules = {
  buzz: { enabled: true, penalty: "none", timerSeconds: DEFAULT_BUZZ_TIMER_SECONDS },
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
  /** Players who declared "no Hitster" for the current window */
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
}

export interface PlayerState {
  id: string;
  name: string;
  score: number;
  timelineLength: number;
  tokens: number;
  isLocal: boolean;
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
  passedIds: string[];
  playlistName: string | null;
  playlistImageUrl: string | null;
  playlistTrackCount: number;
  guessResult: { titleCorrect: boolean; artistCorrect: boolean } | null;
}
