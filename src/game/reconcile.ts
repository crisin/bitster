import type { GameState, Song } from "./types";

/**
 * Structural sharing at the store boundary. Every broadcast arrives as a
 * freshly parsed object graph — even when nothing but `passedIds` changed,
 * every timeline array and player object has a new identity, and zustand's
 * Object.is selectors re-render the entire game UI. Four players passing in
 * a row used to mean four full re-renders of every timeline card.
 *
 * These helpers keep the PREVIOUS reference whenever the content is equal,
 * so unchanged slices never reach React. Pure and total: any shape mismatch
 * simply returns the incoming value.
 */

function sameSong(a: Song, b: Song): boolean {
  // id + year covers identity AND the masking flip (year 0 → real at reveal);
  // every other field is immutable per song id
  return a.id === b.id && a.year === b.year;
}

function reconcileSongs(prev: Song[] | undefined, next: Song[]): Song[] {
  if (!prev || prev.length !== next.length) return next;
  for (let i = 0; i < next.length; i++) {
    if (!sameSong(prev[i], next[i])) return next;
  }
  return prev;
}

export function reconcileTimelines(
  prev: Record<string, Song[]>,
  next: Record<string, Song[]>,
): Record<string, Song[]> {
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);
  let allSame = prevKeys.length === nextKeys.length;
  const out: Record<string, Song[]> = {};
  for (const key of nextKeys) {
    const kept = reconcileSongs(prev[key], next[key]);
    out[key] = kept;
    if (kept !== prev[key]) allSame = false;
  }
  // When every per-player array survived, the whole record can survive too
  return allSame ? prev : out;
}

export function reconcilePlayers(
  prev: GameState["players"],
  next: GameState["players"],
): GameState["players"] {
  if (prev.length !== next.length) return next;
  let allSame = true;
  const out = next.map((player, i) => {
    const old = prev[i];
    const stats = old.stats;
    const fresh = player.stats;
    const same =
      old.id === player.id &&
      old.name === player.name &&
      old.score === player.score &&
      old.timelineLength === player.timelineLength &&
      old.tokens === player.tokens &&
      old.isLocal === player.isLocal &&
      old.connected === player.connected &&
      old.disconnectedUntil === player.disconnectedUntil &&
      stats.placedCorrect === fresh.placedCorrect &&
      stats.placedWrong === fresh.placedWrong &&
      stats.buzzWins === fresh.buzzWins &&
      stats.buzzFails === fresh.buzzFails &&
      stats.guessTokens === fresh.guessTokens &&
      stats.skips === fresh.skips;
    if (!same) allSame = false;
    return same ? old : player;
  });
  return allSame ? prev : out;
}

function sameStringArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Small objects (settings, guessResult, lastResult) are cheapest compared by
 * serialization — they are bounded and this runs once per broadcast, not per
 * frame. Returns the previous value on equality so identity survives.
 */
function reconcileJson<T>(prev: T, next: T): T {
  if (prev === next) return prev;
  if (prev == null || next == null) return next;
  return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}

/** The incoming state with every unchanged slice swapped for its old self */
export function reconcileGameState(
  prev: {
    players: GameState["players"];
    timelines: Record<string, Song[]>;
    failedTimelines: Record<string, Song[]>;
    playedSongs: GameState["playedSongs"];
    passedIds: string[];
    settings: GameState["settings"];
    guessResult: GameState["guessResult"];
    lastResult: GameState["lastResult"];
  },
  next: GameState,
): GameState {
  return {
    ...next,
    players: reconcilePlayers(prev.players, next.players),
    timelines: reconcileTimelines(prev.timelines, next.timelines),
    failedTimelines: reconcileTimelines(prev.failedTimelines, next.failedTimelines),
    // playedSongs only ever grows; same length = same content
    playedSongs:
      prev.playedSongs.length === next.playedSongs.length
        ? prev.playedSongs
        : next.playedSongs,
    passedIds: sameStringArray(prev.passedIds, next.passedIds)
      ? prev.passedIds
      : next.passedIds,
    settings: reconcileJson(prev.settings, next.settings),
    guessResult: reconcileJson(prev.guessResult, next.guessResult),
    lastResult: reconcileJson(prev.lastResult, next.lastResult),
  };
}
