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

export interface GameSettings {
  winScore: number;
  maxPlayers: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  winScore: 10,
  maxPlayers: 8,
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
}
