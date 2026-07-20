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
  const buzzerId = useGameStore((s) => s.buzzerId);

  return useMemo(() => {
    // Peer id is assigned by the server after connect — while it's still null,
    // never report host/turn (null === null would make everyone the host)
    const isMyTurn = myPeerId != null && currentPlayerId === myPeerId;
    const isHost = myPeerId != null && hostId === myPeerId;
    const myTimeline: Song[] = myPeerId ? timelines[myPeerId] ?? [] : [];
    const currentPlayer = players.find((p) => p.id === currentPlayerId);
    const me = players.find((p) => p.id === myPeerId);

    // Pass-and-play: local players live on the host's device, which acts
    // for them. "acting" = this device drives the current turn's UI.
    const currentIsLocal = currentPlayer?.isLocal === true;
    const actsForCurrent = isMyTurn || (isHost && currentIsLocal);
    /** Whom to dispatch as when acting for the current player (null = not acting) */
    const actingId = isMyTurn
      ? myPeerId
      : isHost && currentIsLocal
        ? currentPlayer.id
        : null;

    // Same for an active buzz: the host device places for a local buzzer
    const buzzer = players.find((p) => p.id === buzzerId);
    const isBuzzer = myPeerId != null && buzzerId != null && buzzerId === myPeerId;
    const controlsBuzzer = isBuzzer || (isHost && buzzer?.isLocal === true);
    const buzzActingId = isBuzzer
      ? myPeerId
      : isHost && buzzer?.isLocal === true
        ? buzzer.id
        : null;

    return {
      myPeerId,
      isMyTurn,
      isHost,
      myTimeline,
      currentPlayer,
      me,
      actsForCurrent,
      actingId,
      isBuzzer,
      controlsBuzzer,
      buzzActingId,
    };
  }, [myPeerId, players, currentPlayerId, hostId, timelines, buzzerId]);
}
