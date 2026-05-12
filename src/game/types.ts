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
}

export interface BuzzRules {
  enabled: boolean;
  penalty: "none" | "lose-point";
}

export interface GameRules {
  buzz: BuzzRules;
}

export const DEFAULT_RULES: GameRules = {
  buzz: { enabled: true, penalty: "none" },
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
  playlistName: string | null;
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
}

export interface GameState {
  roomCode: string;
  phase: Phase;
  players: PlayerState[];
  currentPlayerId: string | null;
  currentSongUri: string | null;
  currentSongId: string | null;
  timelines: Record<string, Song[]>;
  lastResult: PlacementResult | null;
  hostId: string;
  settings: GameSettings;
  playedSongs: { name: string; artist: string; year: number }[];
  buzzerId: string | null;
  playlistName: string | null;
  guessResult: { titleCorrect: boolean; artistCorrect: boolean } | null;
}
