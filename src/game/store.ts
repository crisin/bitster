import { create } from "zustand";
import type { GameState, GameSettings, Phase, Song, PlacementResult } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { reconcileGameState } from "./reconcile";

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
  buzzDeadline: number | null;
  placeDeadline: number | null;
  passedIds: string[];
  playlistName: string | null;
  playlistImageUrl: string | null;
  playlistUrl: string | null;
  playlistTrackCount: number;
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
  buzzDeadline: null as number | null,
  placeDeadline: null as number | null,
  passedIds: [] as string[],
  playlistName: null as string | null,
  playlistImageUrl: null as string | null,
  playlistUrl: null as string | null,
  playlistTrackCount: 0,
  guessResult: null as GameState["guessResult"],
};

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,

  setRoomCode: (code) => set({ roomCode: code }),

  applyGameState: (incoming) =>
    set((prev) => {
      // Structural sharing: every broadcast arrives freshly parsed, so
      // without this each one re-renders the whole game UI even when only
      // one scalar moved (see reconcile.ts). Unchanged slices keep their
      // old identity and never wake their subscribers.
      const state = reconcileGameState(prev, incoming);
      return {
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
        buzzDeadline: state.buzzDeadline,
        placeDeadline: state.placeDeadline,
        passedIds: state.passedIds,
        playlistName: state.playlistName,
        playlistImageUrl: state.playlistImageUrl,
        playlistUrl: state.playlistUrl,
        playlistTrackCount: state.playlistTrackCount,
        guessResult: state.guessResult,
      };
    }),

  reset: () => set(initialState),
}));
