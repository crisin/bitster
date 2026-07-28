import { create } from "zustand";
import type { PlaylistProbe, StreamingAccount, StreamingDevice } from "./types";

type AuthStatus = "unauthenticated" | "loading" | "authenticated";

interface StreamingStore {
  activeProviderId: string | null;
  authStatus: AuthStatus;
  tokenExpiresAt: number | null;
  activeDevice: StreamingDevice | null;
  availableDevices: StreamingDevice[];
  /** Profile of the connected account (null until loaded / on 403) */
  account: StreamingAccount | null;
  /** Last playback failure on THIS client (each player sees their own) */
  playbackError: string | null;
  /**
   * How much of the chosen playlist looks usable — measured on the HOST's
   * account only, so it stays host-local instead of being broadcast. Telling a
   * peer "47 of 50 playable" about somebody else's account would be a lie.
   */
  playlistProbe: PlaylistProbe | null;

  setActiveProvider: (id: string | null) => void;
  setAuthStatus: (status: AuthStatus) => void;
  setTokenExpiry: (expiresAt: number | null) => void;
  setActiveDevice: (device: StreamingDevice | null) => void;
  setAvailableDevices: (devices: StreamingDevice[]) => void;
  setAccount: (account: StreamingAccount | null) => void;
  setPlaybackError: (error: string | null) => void;
  setPlaylistProbe: (probe: PlaylistProbe | null) => void;
  reset: () => void;
}

const initialState = {
  activeProviderId: null as string | null,
  authStatus: "unauthenticated" as AuthStatus,
  tokenExpiresAt: null as number | null,
  activeDevice: null as StreamingDevice | null,
  availableDevices: [] as StreamingDevice[],
  account: null as StreamingAccount | null,
  playbackError: null as string | null,
  playlistProbe: null as PlaylistProbe | null,
};

export const useStreamingStore = create<StreamingStore>((set) => ({
  ...initialState,

  setActiveProvider: (id) => set({ activeProviderId: id }),
  setAuthStatus: (status) => set({ authStatus: status }),
  setTokenExpiry: (expiresAt) => set({ tokenExpiresAt: expiresAt }),
  setActiveDevice: (device) => set({ activeDevice: device }),
  setAvailableDevices: (devices) => set({ availableDevices: devices }),
  setAccount: (account) => set({ account }),
  setPlaybackError: (error) => set({ playbackError: error }),
  setPlaylistProbe: (probe) => set({ playlistProbe: probe }),
  reset: () => set(initialState),
}));
