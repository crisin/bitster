import { create } from "zustand";
import type { GameState, GameSettings, Phase, Song, PlacementResult } from "./types";
import { DEFAULT_SETTINGS } from "./types";

interface GameStore {
  roomCode: string | null;
  phase: Phase;
  players: GameState["players"];
  currentPlayerId: string | null;
  currentSongUri: string | null;
  currentSongId: string | null;
  timelines: Record<string, Song[]>;
  failedTimelines: Record<string, Song[]>;
  lastResult: PlacementResult | null;
  hostId: string | null;
  settings: GameSettings;
  playedSongs: GameState["playedSongs"];
  buzzerId: string | null;
  playlistName: string | null;
  guessResult: GameState["guessResult"];

  setRoomCode: (code: string | null) => void;
  applyGameState: (state: GameState) => void;
  reset: () => void;
}

const initialState = {
  roomCode: null as string | null,
  phase: "lobby" as Phase,
  players: [] as GameState["players"],
  currentPlayerId: null as string | null,
  currentSongUri: null as string | null,
  currentSongId: null as string | null,
  timelines: {} as Record<string, Song[]>,
  failedTimelines: {} as Record<string, Song[]>,
  lastResult: null as PlacementResult | null,
  hostId: null as string | null,
  settings: DEFAULT_SETTINGS as GameSettings,
  playedSongs: [] as GameState["playedSongs"],
  buzzerId: null as string | null,
  playlistName: null as string | null,
  guessResult: null as GameState["guessResult"],
};

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,

  setRoomCode: (code) => set({ roomCode: code }),

  applyGameState: (state) =>
    set({
      roomCode: state.roomCode,
      phase: state.phase,
      players: state.players,
      currentPlayerId: state.currentPlayerId,
      currentSongUri: state.currentSongUri,
      currentSongId: state.currentSongId,
      timelines: state.timelines,
      failedTimelines: state.failedTimelines,
      lastResult: state.lastResult,
      hostId: state.hostId,
      settings: state.settings,
      playedSongs: state.playedSongs,
      buzzerId: state.buzzerId,
      playlistName: state.playlistName,
      guessResult: state.guessResult,
    }),

  reset: () => set(initialState),
}));
