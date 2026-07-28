import type { GameState } from "@/game/types";
import type { StoredRound } from "@/history/types";
import { createThemedStyles } from "@/theme/themedStyles";
import { FONT, RADIUS, SPACE } from "@/utils/constants";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface AwardsProps {
  players: GameState["players"];
  /** Round log for the finished game — empty falls back to the flat counters */
  rounds?: StoredRound[];
}

export interface Award {
  emoji: string;
  title: string;
  playerName: string;
  caption: string;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

interface Tally {
  name: string;
  placed: number;
  correct: number;
  times: number[];
  decades: Set<number>;
  steals: number;
  failedBuzzes: number;
  tokens: number;
  wrong: number;
  skips: number;
  timeouts: number;
  bestStreak: number;
  streak: number;
}

/**
 * Awards from the round log. Richer than the flat counters — it knows WHEN
 * things happened, so streaks and reaction times become visible.
 */
export function computeAwards(
  players: GameState["players"],
  rounds: StoredRound[],
): Award[] {
  const tally = new Map<string, Tally>();
  const get = (id: string, name: string): Tally => {
    let entry = tally.get(id);
    if (!entry) {
      entry = {
        name,
        placed: 0,
        correct: 0,
        times: [],
        decades: new Set(),
        steals: 0,
        failedBuzzes: 0,
        tokens: 0,
        wrong: 0,
        skips: 0,
        timeouts: 0,
        bestStreak: 0,
        streak: 0,
      };
      tally.set(id, entry);
    }
    return entry;
  };
  const nameOf = (id: string, fallback: string) =>
    players.find((p) => p.id === id)?.name ?? fallback;

  for (const round of rounds) {
    const active = get(
      round.activePlayerId,
      nameOf(round.activePlayerId, round.activePlayerName),
    );
    if (round.outcome === "placed") {
      active.placed++;
      if (round.correct === true) {
        active.correct++;
        active.streak++;
        active.bestStreak = Math.max(active.bestStreak, active.streak);
        if (round.placeMs !== null) active.times.push(round.placeMs);
        if (round.song.year > 0) {
          active.decades.add(Math.floor(round.song.year / 10) * 10);
        }
      } else {
        active.wrong++;
        active.streak = 0;
      }
    }
    if (round.outcome === "skipped") active.skips++;
    if (round.outcome === "timeout") active.timeouts++;
    if (round.guess) active.tokens += round.guess.tokens;

    if (round.buzz) {
      const buzzer = get(
        round.buzz.playerId,
        nameOf(round.buzz.playerId, round.buzz.playerName),
      );
      if (round.buzz.stolen) buzzer.steals++;
      else buzzer.failedBuzzes++;
    }
  }

  const entries = [...tally.values()];
  const best = (
    emoji: string,
    title: string,
    value: (t: Tally) => number,
    caption: (t: Tally, n: number) => string,
    eligible: (t: Tally) => boolean = () => true,
  ): Award | null => {
    let winner: Tally | null = null;
    let bestValue = 0;
    for (const entry of entries) {
      if (!eligible(entry)) continue;
      const v = value(entry);
      if (v > bestValue) {
        winner = entry;
        bestValue = v;
      }
    }
    return winner
      ? {
          emoji,
          title,
          playerName: winner.name,
          caption: caption(winner, bestValue),
        }
      : null;
  };

  return [
    best(
      "🎯",
      "Sniper",
      (t) => (t.placed >= 3 ? t.correct / t.placed : 0),
      (t) => `${t.correct}/${t.placed} nailed`,
      (t) => t.placed >= 3,
    ),
    best(
      "⚡",
      "Quick Draw",
      // Inverted: the fastest median wins, so score it as "seconds saved"
      (t) => (t.times.length >= 2 ? 60_000 / median(t.times) : 0),
      (t) => `${(median(t.times) / 1000).toFixed(1)}s trigger finger`,
      (t) => t.times.length >= 2,
    ),
    best(
      "🕰",
      "Time Traveler",
      (t) => t.decades.size,
      (_t, n) => `${n} decade${n === 1 ? "" : "s"} covered`,
    ),
    best("🧊", "Ice Cold", (t) => t.bestStreak, (_t, n) => `${n} in a row`),
    best(
      "🏴‍☠️",
      "Highway Robber",
      (t) => t.steals,
      (_t, n) => `${n} card${n === 1 ? "" : "s"} stolen`,
    ),
    best(
      "💥",
      "Bold Moves",
      (t) => t.failedBuzzes,
      (_t, n) => `${n} failed challenge${n === 1 ? "" : "s"}`,
    ),
    best(
      "🔮",
      "The Oracle",
      (t) => t.tokens,
      (_t, n) => `${n} bonus star${n === 1 ? "" : "s"} guessed`,
    ),
    best(
      "🙈",
      "Chaos Gremlin",
      (t) => t.wrong,
      (_t, n) => `${n} misplace${n === 1 ? "" : "s"}`,
    ),
    best("⏭️", "Skip DJ", (t) => t.skips, (_t, n) => `${n} skip${n === 1 ? "" : "s"}`),
    best(
      "⏱️",
      "Too Slow",
      (t) => t.timeouts,
      (_t, n) => `${n} song${n === 1 ? "" : "s"} lost to the clock`,
    ),
  ].filter((a): a is Award => a !== null);
}

interface AwardDef {
  emoji: string;
  title: string;
  /** What the number means, e.g. "3 perfect drops" */
  caption: (n: number) => string;
  value: (p: GameState["players"][number]) => number;
}

const AWARD_DEFS: AwardDef[] = [
  {
    emoji: "🎯",
    title: "Sniper",
    caption: (n) => `${n} perfect drop${n === 1 ? "" : "s"}`,
    value: (p) => p.stats.placedCorrect,
  },
  {
    emoji: "🔮",
    title: "The Oracle",
    caption: (n) => `${n} bonus star${n === 1 ? "" : "s"} guessed`,
    value: (p) => p.stats.guessTokens,
  },
  {
    emoji: "⚡",
    title: "Bitster Royalty",
    caption: (n) => `${n} steal${n === 1 ? "" : "s"}`,
    value: (p) => p.stats.buzzWins,
  },
  {
    emoji: "🙈",
    title: "Chaos Gremlin",
    caption: (n) => `${n} misplace${n === 1 ? "" : "s"}`,
    value: (p) => p.stats.placedWrong,
  },
  {
    emoji: "💥",
    title: "Bold Moves",
    caption: (n) => `${n} failed challenge${n === 1 ? "" : "s"}`,
    value: (p) => p.stats.buzzFails,
  },
  {
    emoji: "⏭️",
    title: "Skip DJ",
    caption: (n) => `${n} skip${n === 1 ? "" : "s"}`,
    value: (p) => p.stats.skips,
  },
];

/** Fallback for an older host that sends no round log */
function legacyAwards(players: GameState["players"]): Award[] {
  return AWARD_DEFS.map((def) => {
    let best: GameState["players"][number] | null = null;
    let bestValue = 0;
    for (const p of players) {
      const value = def.value(p);
      if (value > bestValue) {
        best = p;
        bestValue = value;
      }
    }
    return best
      ? {
          emoji: def.emoji,
          title: def.title,
          playerName: best.name,
          caption: def.caption(bestValue),
        }
      : null;
  }).filter((a): a is Award => a !== null);
}

/**
 * End-game fun awards. Preferably from the round log, which knows the order of
 * events; without one (older host, recap not in yet) it falls back to the flat
 * per-player counters.
 */
export function Awards({ players, rounds = [] }: AwardsProps) {
  const styles = useStyles();

  const awards =
    rounds.length > 0
      ? computeAwards(players, rounds)
      : legacyAwards(players);

  if (awards.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Awards</Text>
      <View style={styles.grid}>
        {awards.map((award) => (
          <View key={award.title} style={styles.card}>
            <Text style={styles.emoji}>{award.emoji}</Text>
            <Text style={styles.title}>{award.title}</Text>
            <Text style={styles.player} numberOfLines={1}>
              {award.playerName}
            </Text>
            <Text style={styles.caption}>{award.caption}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) =>
  StyleSheet.create({
    container: {
      width: "100%",
      gap: SPACE.md,
      alignItems: "center",
    },
    heading: {
      fontSize: FONT.size.sm,
      fontWeight: FONT.weight.bold,
      color: COLORS.textSecondary,
      textTransform: "uppercase",
      letterSpacing: FONT.tracking.wider,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: SPACE.md,
    },
    card: {
      width: 148,
      alignItems: "center",
      gap: 2,
      paddingVertical: SPACE.md,
      paddingHorizontal: SPACE.sm,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgCard,
    },
    emoji: {
      fontSize: FONT.size["2xl"],
    },
    title: {
      fontSize: FONT.size.sm,
      fontWeight: FONT.weight.bold,
      color: COLORS.textPrimary,
    },
    player: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
    },
    caption: {
      fontSize: FONT.size.xs,
      color: COLORS.textSecondary,
      opacity: 0.7,
    },
  }),
);
