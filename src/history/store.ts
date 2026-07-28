import { create } from "zustand";
import type { GameRecap } from "@/game/types";
import { log as logger } from "@/utils/logger";
import { getOrCreateDeviceIdentity, isProvisional } from "./identity";
import {
  applyRingBuffer,
  clearHistory,
  loadHistory,
  rewriteIdentity,
  saveHistory,
  toStoredGame,
} from "./storage";
import type { MyPlayer, StoredGame } from "./types";
import { HISTORY_SCHEMA } from "./types";

interface HistoryStore {
  loaded: boolean;
  identityId: string | null;
  games: StoredGame[];
  /** The game that just ended — drives the finished screen */
  lastGame: StoredGame | null;

  hydrate: () => Promise<void>;
  adoptIdentity: (identityId: string) => void;
  recordGame: (recap: GameRecap, mine: MyPlayer[]) => void;
  clear: () => Promise<void>;
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  loaded: false,
  identityId: null,
  games: [],
  lastGame: null,

  hydrate: async () => {
    if (get().loaded) return;
    const [file, deviceId] = await Promise.all([
      loadHistory(),
      getOrCreateDeviceIdentity(),
    ]);
    // A game can finish before a slow cold-start read resolves — merge rather
    // than replace, or that game would be wiped by its own hydration.
    const merged = applyRingBuffer([...get().games, ...file.entries]);
    set({
      loaded: true,
      games: merged,
      identityId: get().identityId ?? deviceId,
    });
  },

  /**
   * The account resolved after the fact. Games recorded under the provisional
   * device id move over once; a DIFFERENT account never absorbs them — that
   * would defeat the point of an identity.
   */
  adoptIdentity: (identityId) => {
    const { identityId: current, games } = get();
    if (current === identityId) return;
    if (current && isProvisional(current) && !isProvisional(identityId)) {
      const moved = rewriteIdentity(games, current, identityId);
      set({ identityId, games: moved });
      void saveHistory({ schema: HISTORY_SCHEMA, entries: moved });
      logger.info("history", "Moved local games onto the connected account");
      return;
    }
    set({ identityId });
  },

  recordGame: (recap, mine) => {
    const identityId = get().identityId ?? "device:ephemeral";
    const entry = toStoredGame(recap, mine, identityId, Date.now());
    const games = applyRingBuffer([entry, ...get().games]);
    // lastGame is set unconditionally so the end screen never blanks, even if
    // hydration has not finished yet
    set({ games, lastGame: entry });
    void saveHistory({ schema: HISTORY_SCHEMA, entries: games });
  },

  clear: async () => {
    set({ games: [], lastGame: null });
    await clearHistory();
  },
}));
