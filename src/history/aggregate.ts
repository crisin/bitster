import type { StoredGame, StoredRound, StoredSong } from "./types";

/**
 * Whose numbers we want. One device can hold several: its owner plus every
 * pass-and-play player who ever sat at it.
 */
export interface Who {
  identityId: string;
  /** null = the device owner, a name = a pass-and-play local player */
  localName: string | null;
}

export interface AllTimeStats {
  games: number;
  wins: number;
  winRate: number;
  rounds: number;
  correct: number;
  hitRate: number;
  steals: number;
  stealsAttempted: number;
  stealRate: number;
  penalties: number;
  tokensGuessed: number;
  skips: number;
  timeouts: number;
  medianPlaceMs: number | null;
  fastestPlaceMs: number | null;
  longestTimeline: number;
  decadesCovered: number;
}

const EMPTY: AllTimeStats = {
  games: 0,
  wins: 0,
  winRate: 0,
  rounds: 0,
  correct: 0,
  hitRate: 0,
  steals: 0,
  stealsAttempted: 0,
  stealRate: 0,
  penalties: 0,
  tokensGuessed: 0,
  skips: 0,
  timeouts: 0,
  medianPlaceMs: null,
  fastestPlaceMs: null,
  longestTimeline: 0,
  decadesCovered: 0,
};

/** My player id inside one stored game, or null if I wasn't in it */
export function myPlayerId(game: StoredGame, who: Who): string | null {
  if (game.identityId !== who.identityId) return null;
  return (
    game.mine.find((m) => m.localName === who.localName)?.playerId ?? null
  );
}

export function selectGames(
  games: StoredGame[],
  who: Who,
  opts?: { includeDemo?: boolean },
): StoredGame[] {
  return games.filter((game) => {
    if (myPlayerId(game, who) === null) return false;
    if (!opts?.includeDemo && game.recap.demo) return false;
    return true;
  });
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export function computeAllTime(
  games: StoredGame[],
  who: Who,
  opts?: { includeDemo?: boolean },
): AllTimeStats {
  const mine = selectGames(games, who, opts);
  if (mine.length === 0) return { ...EMPTY };

  const stats: AllTimeStats = { ...EMPTY, games: mine.length };
  const placeTimes: number[] = [];
  const decades = new Set<number>();

  for (const game of mine) {
    const me = myPlayerId(game, who);
    if (me === null) continue;

    // An abandoned game never counts as a win, even if somebody was ahead
    if (game.recap.winnerId === me && game.recap.endedReason !== "abandoned") {
      stats.wins++;
    }
    const player = game.recap.players.find((p) => p.id === me);
    if (player) {
      stats.penalties += player.penalties;
      stats.longestTimeline = Math.max(
        stats.longestTimeline,
        player.timelineLength,
      );
    }

    for (const round of game.recap.rounds) {
      // Placement stats are attributed to whoever was on turn...
      if (round.activePlayerId === me) {
        stats.rounds++;
        if (round.outcome === "skipped") stats.skips++;
        if (round.outcome === "timeout") stats.timeouts++;
        if (round.correct === true) {
          stats.correct++;
          if (round.placeMs !== null) placeTimes.push(round.placeMs);
          if (round.song.year > 0) {
            decades.add(Math.floor(round.song.year / 10) * 10);
          }
        }
        if (round.guess) stats.tokensGuessed += round.guess.tokens;
      }
      // ...steals to whoever buzzed, which is a different player
      if (round.buzz?.playerId === me) {
        stats.stealsAttempted++;
        if (round.buzz.stolen) stats.steals++;
      }
    }
  }

  stats.winRate = stats.games > 0 ? stats.wins / stats.games : 0;
  stats.hitRate = stats.rounds > 0 ? stats.correct / stats.rounds : 0;
  stats.stealRate =
    stats.stealsAttempted > 0 ? stats.steals / stats.stealsAttempted : 0;
  stats.medianPlaceMs = median(placeTimes);
  stats.fastestPlaceMs = placeTimes.length > 0 ? Math.min(...placeTimes) : null;
  stats.decadesCovered = decades.size;
  return stats;
}

export interface DecadeBucket {
  decade: number;
  seen: number;
  hit: number;
}

export function decadeHistogram(
  games: StoredGame[],
  who: Who,
  opts?: { includeDemo?: boolean },
): DecadeBucket[] {
  const buckets = new Map<number, DecadeBucket>();
  for (const game of selectGames(games, who, opts)) {
    const me = myPlayerId(game, who);
    for (const round of game.recap.rounds) {
      if (round.activePlayerId !== me) continue;
      // year 0 would be a song that never got revealed
      if (round.song.year <= 0) continue;
      const decade = Math.floor(round.song.year / 10) * 10;
      const bucket = buckets.get(decade) ?? { decade, seen: 0, hit: 0 };
      bucket.seen++;
      if (round.correct === true) bucket.hit++;
      buckets.set(decade, bucket);
    }
  }
  return [...buckets.values()].sort((a, b) => a.decade - b.decade);
}

export interface Nemesis {
  name: string;
  stealsAgainstMe: number;
  stealsByMe: number;
}

/** Who took the most cards off me */
export function findNemesis(
  games: StoredGame[],
  who: Who,
  opts?: { includeDemo?: boolean },
): Nemesis | null {
  const against = new Map<string, { name: string; count: number }>();
  const byMe = new Map<string, number>();

  for (const game of selectGames(games, who, opts)) {
    const me = myPlayerId(game, who);
    for (const round of game.recap.rounds) {
      if (!round.buzz?.stolen) continue;
      if (round.activePlayerId === me && round.buzz.playerId !== me) {
        const key = round.buzz.playerName || round.buzz.playerId;
        const entry = against.get(key) ?? { name: key, count: 0 };
        entry.count++;
        against.set(key, entry);
      }
      if (round.buzz.playerId === me && round.activePlayerId !== me) {
        const key = round.activePlayerName || round.activePlayerId;
        byMe.set(key, (byMe.get(key) ?? 0) + 1);
      }
    }
  }

  let worst: { name: string; count: number } | null = null;
  for (const entry of against.values()) {
    if (!worst || entry.count > worst.count) worst = entry;
  }
  if (!worst) return null;
  return {
    name: worst.name,
    stealsAgainstMe: worst.count,
    stealsByMe: byMe.get(worst.name) ?? 0,
  };
}

export interface BestRound {
  round: StoredRound;
  gameId: string;
}

/** Fastest correct placement — rounds without a measurement don't compete */
export function bestRound(
  games: StoredGame[],
  who: Who,
  opts?: { includeDemo?: boolean },
): BestRound | null {
  let best: BestRound | null = null;
  for (const game of selectGames(games, who, opts)) {
    const me = myPlayerId(game, who);
    for (const round of game.recap.rounds) {
      if (round.activePlayerId !== me) continue;
      if (round.correct !== true || round.placeMs === null) continue;
      if (!best || round.placeMs < best.round.placeMs!) {
        best = { round, gameId: game.id };
      }
    }
  }
  return best;
}

export interface SongTally {
  song: StoredSong;
  seen: number;
  missed: number;
}

export function songLeaderboard(
  games: StoredGame[],
  who: Who,
  opts?: { includeDemo?: boolean },
): SongTally[] {
  const tally = new Map<string, SongTally>();
  for (const game of selectGames(games, who, opts)) {
    const me = myPlayerId(game, who);
    for (const round of game.recap.rounds) {
      if (round.activePlayerId !== me) continue;
      const entry = tally.get(round.song.id) ?? {
        song: round.song,
        seen: 0,
        missed: 0,
      };
      entry.seen++;
      if (round.correct === false) entry.missed++;
      tally.set(round.song.id, entry);
    }
  }
  return [...tally.values()].sort(
    (a, b) => b.seen - a.seen || b.missed - a.missed,
  );
}

/** Every identity/sub-key combination this device has games for */
export function knownPlayers(games: StoredGame[], identityId: string): Who[] {
  const seen = new Map<string, Who>();
  for (const game of games) {
    if (game.identityId !== identityId) continue;
    for (const mine of game.mine) {
      const key = mine.localName ?? "";
      if (!seen.has(key)) seen.set(key, { identityId, localName: mine.localName });
    }
  }
  return [...seen.values()].sort((a, b) =>
    a.localName === null ? -1 : b.localName === null ? 1 : a.localName.localeCompare(b.localName),
  );
}
