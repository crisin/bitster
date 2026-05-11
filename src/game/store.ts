import { create } from "zustand";
import type { Phase, Song, PlacementResult, GameSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";

interface PlayedSongInfo {
  name: string;
  artist: string;
  year: number;
}

interface PlayerInfo {
  id: string;
  name: string;
  score: number;
  timelineLength: number;
  tokens: number;
}

interface GameStore {
  roomCode: string | null;
  phase: Phase;
  players: PlayerInfo[];
  currentPlayerId: string | null;
  currentSongUri: string | null;
  timelines: Record<string, Song[]>;
  lastResult: PlacementResult | null;
  hostId: string | null;
  settings: GameSettings;
  playedSongs: PlayedSongInfo[];
  buzzerId: string | null;
  playlistName: string | null;

  setRoomCode: (code: string | null) => void;
  setPhase: (phase: Phase) => void;
  setPlayers: (players: PlayerInfo[]) => void;
  setCurrentPlayer: (id: string | null) => void;
  setCurrentSong: (uri: string | null) => void;
  setTimelines: (timelines: Record<string, Song[]>) => void;
  setLastResult: (result: PlacementResult | null) => void;
  setHostId: (id: string | null) => void;
  setSettings: (settings: GameSettings) => void;
  applyGameState: (state: {
    roomCode: string;
    phase: Phase;
    players: PlayerInfo[];
    currentPlayerId: string | null;
    currentSongUri: string | null;
    timelines: Record<string, Song[]>;
    lastResult: PlacementResult | null;
    hostId: string;
    settings: GameSettings;
    playedSongs: PlayedSongInfo[];
    buzzerId: string | null;
    playlistName: string | null;
  }) => void;
  reset: () => void;
}

const initialState = {
  roomCode: null as string | null,
  phase: "lobby" as Phase,
  players: [] as PlayerInfo[],
  currentPlayerId: null as string | null,
  currentSongUri: null as string | null,
  timelines: {} as Record<string, Song[]>,
  lastResult: null as PlacementResult | null,
  hostId: null as string | null,
  settings: DEFAULT_SETTINGS as GameSettings,
  playedSongs: [] as PlayedSongInfo[],
  buzzerId: null as string | null,
  playlistName: null as string | null,
};

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,

  setRoomCode: (code) => set({ roomCode: code }),
  setPhase: (phase) => set({ phase }),
  setPlayers: (players) => set({ players }),
  setCurrentPlayer: (id) => set({ currentPlayerId: id }),
  setCurrentSong: (uri) => set({ currentSongUri: uri }),
  setTimelines: (timelines) => set({ timelines }),
  setLastResult: (result) => set({ lastResult: result }),
  setHostId: (id) => set({ hostId: id }),
  setSettings: (settings) => set({ settings }),

  applyGameState: (state) =>
    set({
      roomCode: state.roomCode,
      phase: state.phase,
      players: state.players,
      currentPlayerId: state.currentPlayerId,
      currentSongUri: state.currentSongUri,
      timelines: state.timelines,
      lastResult: state.lastResult,
      hostId: state.hostId,
      settings: state.settings,
      playedSongs: state.playedSongs,
      buzzerId: state.buzzerId,
      playlistName: state.playlistName,
    }),

  reset: () => set(initialState),
}));
