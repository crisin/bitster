import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GameRecap } from "@/game/types";
import { log as logger } from "@/utils/logger";
import type {
  HistoryFile,
  MyPlayer,
  StoredGame,
  StoredRecap,
  StoredRound,
} from "./types";
import {
  HISTORY_SCHEMA,
  HISTORY_STORAGE_KEY,
  MAX_GAMES,
  MAX_HISTORY_BYTES,
  MAX_ROUNDS_STORED,
} from "./types";

/**
 * Project a broadcast recap down to what is worth keeping. Deliberately an
 * explicit whitelist rather than a schema-driven projection: safe by default,
 * so a new song field cannot start silently bloating every device's storage.
 */
export function toStoredGame(
  recap: GameRecap,
  mine: MyPlayer[],
  identityId: string,
  now: number,
): StoredGame {
  const rounds: StoredRound[] = recap.rounds
    .slice(0, MAX_ROUNDS_STORED)
    .map((round) => ({
      ...round,
      song: {
        id: round.song.id,
        name: round.song.name,
        artist: round.song.artist,
        year: round.song.year,
      },
    }));

  const stored: StoredRecap = { ...recap, rounds };
  return {
    id: `${recap.roomCode}:${recap.endedAt}`,
    identityId,
    storedAt: now,
    mine,
    recap: stored,
  };
}

/**
 * Never throws and never half-migrates: anything unreadable becomes an empty
 * file. A corrupt history must not be able to break the game.
 */
export function parseHistoryFile(raw: string | null): HistoryFile {
  const empty: HistoryFile = { schema: HISTORY_SCHEMA, entries: [] };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return empty;
    const file = parsed as Partial<HistoryFile>;
    // Future schemas migrate here: if (file.schema === 1) return migrate1to2(...)
    if (file.schema !== HISTORY_SCHEMA) return empty;
    if (!Array.isArray(file.entries)) return empty;
    return { schema: HISTORY_SCHEMA, entries: file.entries };
  } catch {
    return empty;
  }
}

/** Newest first, deduped by id, capped by count and then by byte size */
export function applyRingBuffer(entries: StoredGame[]): StoredGame[] {
  const sorted = [...entries].sort((a, b) => b.storedAt - a.storedAt);
  const seen = new Set<string>();
  const deduped: StoredGame[] = [];
  for (const entry of sorted) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    deduped.push(entry);
  }

  const capped = deduped.slice(0, MAX_GAMES);
  while (
    capped.length > 1 &&
    JSON.stringify(capped).length > MAX_HISTORY_BYTES
  ) {
    capped.pop();
  }
  return capped;
}

/** Move entries from a provisional device identity onto a real account one */
export function rewriteIdentity(
  entries: StoredGame[],
  from: string,
  to: string,
): StoredGame[] {
  return entries.map((entry) =>
    entry.identityId === from ? { ...entry, identityId: to } : entry,
  );
}

export async function loadHistory(): Promise<HistoryFile> {
  try {
    return parseHistoryFile(await AsyncStorage.getItem(HISTORY_STORAGE_KEY));
  } catch (err) {
    logger.warn("history", `Could not read the history: ${err}`);
    return { schema: HISTORY_SCHEMA, entries: [] };
  }
}

/**
 * Best-effort, exactly like the theme store: if the device is out of space we
 * drop the oldest games and try once more, then give up quietly. Losing old
 * history is never worth an error in the middle of a party.
 */
export async function saveHistory(file: HistoryFile): Promise<void> {
  try {
    await AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(file));
  } catch (err) {
    logger.warn("history", `History write failed, evicting oldest: ${err}`);
    try {
      const trimmed: HistoryFile = {
        ...file,
        entries: file.entries.slice(0, Math.max(0, file.entries.length - 10)),
      };
      await AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
    } catch (retryErr) {
      logger.warn("history", `History write gave up: ${retryErr}`);
    }
  }
}

export async function clearHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch (err) {
    logger.warn("history", `Could not clear the history: ${err}`);
  }
}
