import { create } from "zustand";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface PeerInfo {
  id: string;
  name: string;
  connected: boolean;
}

interface P2PStore {
  status: ConnectionStatus;
  myPeerId: string | null;
  peers: PeerInfo[];
  reconnectAttempts: number;
  lastError: string | null;

  setStatus: (status: ConnectionStatus) => void;
  setMyPeerId: (id: string | null) => void;
  setPeers: (peers: PeerInfo[]) => void;
  addPeer: (peer: PeerInfo) => void;
  removePeer: (id: string) => void;
  updatePeer: (id: string, update: Partial<PeerInfo>) => void;
  setReconnectAttempts: (n: number) => void;
  setLastError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  status: "disconnected" as ConnectionStatus,
  myPeerId: null as string | null,
  peers: [] as PeerInfo[],
  reconnectAttempts: 0,
  lastError: null as string | null,
};

export const useP2PStore = create<P2PStore>((set) => ({
  ...initialState,

  setStatus: (status) => set({ status }),
  setMyPeerId: (id) => set({ myPeerId: id }),
  setPeers: (peers) => set({ peers }),

  addPeer: (peer) =>
    set((state) => ({
      peers: [...state.peers.filter((p) => p.id !== peer.id), peer],
    })),

  removePeer: (id) =>
    set((state) => ({
      peers: state.peers.filter((p) => p.id !== id),
    })),

  updatePeer: (id, update) =>
    set((state) => ({
      peers: state.peers.map((p) => (p.id === id ? { ...p, ...update } : p)),
    })),

  setReconnectAttempts: (n) => set({ reconnectAttempts: n }),
  setLastError: (error) => set({ lastError: error }),
  reset: () => set(initialState),
}));
