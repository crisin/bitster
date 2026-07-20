import { useMemo } from "react";
import { useGameStore } from "@/game/store";
import { useP2PStore } from "@/p2p/store";
import type { Song } from "@/game/types";

export function useCurrentPlayer() {
  const myPeerId = useP2PStore((s) => s.myPeerId);
  const players = useGameStore((s) => s.players);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const hostId = useGameStore((s) => s.hostId);
  const timelines = useGameStore((s) => s.timelines);

  return useMemo(() => {
    // Peer id is assigned by the server after connect — while it's still null,
    // never report host/turn (null === null would make everyone the host)
    const isMyTurn = myPeerId != null && currentPlayerId === myPeerId;
    const isHost = myPeerId != null && hostId === myPeerId;
    const myTimeline: Song[] = myPeerId ? timelines[myPeerId] ?? [] : [];
    const currentPlayer = players.find((p) => p.id === currentPlayerId);
    const me = players.find((p) => p.id === myPeerId);

    return {
      myPeerId,
      isMyTurn,
      isHost,
      myTimeline,
      currentPlayer,
      me,
    };
  }, [myPeerId, players, currentPlayerId, hostId, timelines]);
}
