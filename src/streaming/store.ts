import { create } from "zustand";
import type { StreamingDevice } from "./types";

type AuthStatus = "unauthenticated" | "loading" | "authenticated";

interface StreamingStore {
  activeProviderId: string | null;
  authStatus: AuthStatus;
  tokenExpiresAt: number | null;
  activeDevice: StreamingDevice | null;
  availableDevices: StreamingDevice[];

  setActiveProvider: (id: string | null) => void;
  setAuthStatus: (status: AuthStatus) => void;
  setTokenExpiry: (expiresAt: number | null) => void;
  setActiveDevice: (device: StreamingDevice | null) => void;
  setAvailableDevices: (devices: StreamingDevice[]) => void;
  reset: () => void;
}

const initialState = {
  activeProviderId: null as string | null,
  authStatus: "unauthenticated" as AuthStatus,
  tokenExpiresAt: null as number | null,
  activeDevice: null as StreamingDevice | null,
  availableDevices: [] as StreamingDevice[],
};

export const useStreamingStore = create<StreamingStore>((set) => ({
  ...initialState,

  setActiveProvider: (id) => set({ activeProviderId: id }),
  setAuthStatus: (status) => set({ authStatus: status }),
  setTokenExpiry: (expiresAt) => set({ tokenExpiresAt: expiresAt }),
  setActiveDevice: (device) => set({ activeDevice: device }),
  setAvailableDevices: (devices) => set({ availableDevices: devices }),
  reset: () => set(initialState),
}));
