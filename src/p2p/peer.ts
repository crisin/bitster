import type { P2PAction } from "./protocol";
import { useGameStore } from "@/game/store";
import { useP2PStore } from "./store";
import { getProvider } from "@/streaming/registry";
import { useStreamingStore } from "@/streaming/store";
import { log as logger } from "@/utils/logger";

/** Callbacks into the transport layer — avoids a circular import */
export interface PeerContext {
  myId: string | null;
  /** First game-state arrived — the join handshake is complete */
  onInitialState: () => void;
  /** Host rejected us before we ever got state (room full, game running) */
  onFatalError: (message: string) => void;
}

let receivedInitialState = false;

export function resetPeerState(): void {
  receivedInitialState = false;
}

export function hasReceivedState(): boolean {
  return receivedInitialState;
}

/** Handles a validated action coming from the host peer. */
export function handleHostMessage(action: P2PAction, ctx: PeerContext): void {
  switch (action.type) {
    case "game-state": {
      if (!receivedInitialState) {
        receivedInitialState = true;
        ctx.onInitialState();
      }
      useP2PStore.getState().setStatus("connected");
      useGameStore.getState().applyGameState(action.payload);
      const peers = action.payload.players
        .filter((p) => p.id !== ctx.myId)
        .map((p) => ({ id: p.id, name: p.name, connected: true }));
      useP2PStore.getState().setPeers(peers);
      break;
    }

    case "play-song": {
      const providerId = useStreamingStore.getState().activeProviderId;
      const provider = providerId ? getProvider(providerId) : null;
      if (provider) {
        useStreamingStore.getState().setPlaybackError(null);
        provider.player.play(action.payload.uri).catch((err) => {
          logger.error("p2p", `Peer playback failed: ${err}`);
          useStreamingStore
            .getState()
            .setPlaybackError(err instanceof Error ? err.message : "Playback failed");
        });
      }
      break;
    }

    case "error": {
      logger.error("p2p", `Host error: ${action.payload.message}`);
      if (!receivedInitialState) {
        ctx.onFatalError(action.payload.message);
      } else {
        useP2PStore.getState().setLastError(action.payload.message);
      }
      break;
    }

    default:
      logger.debug("p2p", `Ignoring ${action.type} from host (not a peer-facing action)`);
      break;
  }
}
