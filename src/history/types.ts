import type { GameRecap, RoundRecord } from "@/game/types";

/** Bump when the stored shape changes; parseHistoryFile is the migration seam */
export const HISTORY_SCHEMA = 1;
export const HISTORY_STORAGE_KEY = "bitsterHistory";
export const DEVICE_ID_KEY = "bitsterDeviceId";

export const MAX_GAMES = 50;
export const MAX_ROUNDS_STORED = 150;
export const MAX_HISTORY_BYTES = 400_000;

/**
 * Storage-only song shape. id/name/artist/year is everything any statistic
 * needs; uri and imageUrl would roughly double the file for no analytical
 * value (and Spotify's cover URLs expire anyway).
 */
export interface StoredSong {
  id: string;
  name: string;
  artist: string;
  year: number;
}

export type StoredRound = Omit<RoundRecord, "song"> & { song: StoredSong };
export type StoredRecap = Omit<GameRecap, "rounds"> & { rounds: StoredRound[] };

/** Which player(s) on THIS device the entry is about */
export interface MyPlayer {
  playerId: string;
  /** null = the device owner; a name = a pass-and-play local player */
  localName: string | null;
}

export interface StoredGame {
  /** `${roomCode}:${endedAt}` — the dedupe key across re-deliveries */
  id: string;
  /** "spotify:<accountId>" or "device:<localId>" — never leaves this device */
  identityId: string;
  /** Local wall clock at write time: the sort key, since host clocks can be off */
  storedAt: number;
  mine: MyPlayer[];
  recap: StoredRecap;
}

export interface HistoryFile {
  schema: number;
  entries: StoredGame[];
}
