import { useP2PStore, type ConnectionStatus } from "@/p2p/store";

export function useConnectionStatus(): ConnectionStatus {
  return useP2PStore((s) => s.status);
}
