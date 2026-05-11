export type Phase = "lobby" | "playing" | "reveal" | "finished";

export interface Song {
  id: string;
  uri: string;
  name: string;
  artist: string;
  year: number;
}

export interface Player {
  id: string;
  name: string;
  score: number;
  timeline: Song[];
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
}

export interface PlacementResult {
  correct: boolean;
  song: Song;
}

export interface GameState {
  roomCode: string;
  phase: Phase;
  players: { id: string; name: string; score: number; timelineLength: number }[];
  currentPlayerId: string | null;
  currentSongUri: string | null;
  timelines: Record<string, Song[]>;
  lastResult: PlacementResult | null;
  hostId: string;
  settings: GameSettings;
  playedSongs: { name: string; artist: string; year: number }[];
  buzzerId: string | null;
}
