import type { P2PAction } from "./protocol";
import { useGameStore } from "@/game/store";
import { useHistoryStore } from "@/history/store";
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

/** How many offset samples the median is taken over */
const CLOCK_SAMPLE_COUNT = 5;
/** Don't churn the store for sub-quarter-second jitter */
const CLOCK_UPDATE_EPSILON_MS = 250;

let receivedInitialState = false;
/** Highest stateVersion applied in this session — null = nothing applied yet */
let lastStateVersion: number | null = null;
let clockSamples: number[] = [];

export function resetPeerState(): void {
  receivedInitialState = false;
  lastStateVersion = null;
  clockSamples = [];
  useP2PStore.getState().setClockOffset(0);
}

export function hasReceivedState(): boolean {
  return receivedInitialState;
}

/**
 * One sample per accepted state. hostNow was stamped BEFORE the hop through the
 * relay, so `hostNow - Date.now()` always underestimates the true offset by the
 * one-way delay — every order statistic is therefore on the safe side (we show
 * slightly MORE time than the host counts, never less). The median additionally
 * shrugs off a single stalled sample, where a minimum would latch onto a 3 s
 * mobile-network hiccup for five states.
 */
function recordClockSample(hostNow: number | null): void {
  if (hostNow === null) return; // older host — assume our clock matches
  clockSamples.push(hostNow - Date.now());
  if (clockSamples.length > CLOCK_SAMPLE_COUNT) clockSamples.shift();
  const sorted = [...clockSamples].sort((a, b) => a - b);
  // Lower middle for even counts: an integer, and keeps the conservative bias
  const estimate = sorted[Math.floor((sorted.length - 1) / 2)];
  const store = useP2PStore.getState();
  if (Math.abs(estimate - store.clockOffsetMs) >= CLOCK_UPDATE_EPSILON_MS) {
    store.setClockOffset(estimate);
  }
}

/** Handles a validated action coming from the host peer. */
export function handleHostMessage(action: P2PAction, ctx: PeerContext): void {
  switch (action.type) {
    case "game-state": {
      const state = action.payload;

      // A delayed or duplicated broadcast (a slow relay hop, a targeted resync
      // racing a broadcast) must never overwrite a newer state. This can't fire
      // on the first state after a (re)join: resetPeerState clears the mark.
      if (
        lastStateVersion !== null &&
        state.stateVersion !== null &&
        state.stateVersion <= lastStateVersion
      ) {
        logger.debug(
          "p2p",
          `Dropping stale game-state v${state.stateVersion} (have v${lastStateVersion})`,
        );
        return;
      }
      if (state.stateVersion !== null) lastStateVersion = state.stateVersion;

      // Offset first: the store must be current before the render that shows
      // the new deadline, so both writes land in the same React batch.
      recordClockSample(state.hostNow);

      if (!receivedInitialState) {
        receivedInitialState = true;
        ctx.onInitialState();
      }
      useP2PStore.getState().setResuming(null);
      useP2PStore.getState().setStatus("connected");
      useGameStore.getState().applyGameState(state);
      const peers = state.players
        .filter((p) => p.id !== ctx.myId)
        .map((p) => ({ id: p.id, name: p.name, connected: p.connected }));
      useP2PStore.getState().setPeers(peers);
      break;
    }

    case "play-song": {
      // Demo/mock songs have no real track behind them — don't ask the provider
      if (action.payload.uri.startsWith("mock:")) break;
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

    case "game-recap": {
      // A recap carries every real year, so it is only ever legitimate once
      // the game is over — and only for the room we are actually in.
      const game = useGameStore.getState();
      if (game.phase !== "finished") {
        logger.warn("p2p", "Dropped a game-recap that arrived before the end");
        break;
      }
      if (game.roomCode !== action.payload.roomCode) break;
      if (!ctx.myId) {
        logger.warn("p2p", "Dropped a game-recap — no id to file it under");
        break;
      }
      useHistoryStore
        .getState()
        .recordGame(action.payload, [{ playerId: ctx.myId, localName: null }]);
      break;
    }

    case "error": {
      logger.error("p2p", `Host error: ${action.payload.message}`);
      if (!receivedInitialState) {
        ctx.onFatalError(action.payload.message);
        break;
      }
      // We have state but no seat in it: the host refused us (grace expired,
      // game already running). Without this it stays a 4-second toast and the
      // player sits there as a ghost with no way out.
      const seated = useGameStore
        .getState()
        .players.some((p) => p.id === ctx.myId);
      if (!seated) {
        ctx.onFatalError(action.payload.message);
        break;
      }
      useP2PStore.getState().setLastError(action.payload.message);
      break;
    }

    default:
      logger.debug("p2p", `Ignoring ${action.type} from host (not a peer-facing action)`);
      break;
  }
}
