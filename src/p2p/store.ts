import { create } from "zustand";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface PeerInfo {
  id: string;
  name: string;
  connected: boolean;
}

/** What we are waiting for while `status` is "connecting" */
export type Resuming = "self" | "host" | null;

interface P2PStore {
  status: ConnectionStatus;
  myPeerId: string | null;
  peers: PeerInfo[];
  reconnectAttempts: number;
  lastError: string | null;
  /** True when retrying is pointless (room gone, code taken) — hides Retry */
  errorTerminal: boolean;
  /** "self" = we are rejoining, "host" = the host is away and we wait for them */
  resuming: Resuming;
  /**
   * hostClock - localClock, in ms. Estimated by the peer from GameState.hostNow.
   * Exactly 0 on the host device (it never routes through peer.ts) and on
   * legacy hosts that send no hostNow.
   */
  clockOffsetMs: number;
  /**
   * A long-running job on the HOST's device (collecting random songs). Purely
   * local progress — never broadcast, because peers have nothing to do with it.
   */
  hostTask: { label: string; done: number; total: number } | null;

  setStatus: (status: ConnectionStatus) => void;
  setMyPeerId: (id: string | null) => void;
  setPeers: (peers: PeerInfo[]) => void;
  addPeer: (peer: PeerInfo) => void;
  removePeer: (id: string) => void;
  updatePeer: (id: string, update: Partial<PeerInfo>) => void;
  setReconnectAttempts: (n: number) => void;
  setLastError: (error: string | null, terminal?: boolean) => void;
  setResuming: (resuming: Resuming) => void;
  setClockOffset: (ms: number) => void;
  setHostTask: (task: { label: string; done: number; total: number } | null) => void;
  reset: () => void;
}

const initialState = {
  status: "disconnected" as ConnectionStatus,
  myPeerId: null as string | null,
  peers: [] as PeerInfo[],
  reconnectAttempts: 0,
  lastError: null as string | null,
  errorTerminal: false,
  resuming: null as Resuming,
  clockOffsetMs: 0,
  hostTask: null as { label: string; done: number; total: number } | null,
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
  setLastError: (error, terminal = false) =>
    set({ lastError: error, errorTerminal: error === null ? false : terminal }),
  setResuming: (resuming) => set({ resuming }),
  setClockOffset: (ms) => set({ clockOffsetMs: ms }),
  setHostTask: (hostTask) => set({ hostTask }),
  reset: () => set(initialState),
}));
