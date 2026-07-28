import type { GameState } from "@/game/types";
import { createThemedStyles } from "@/theme/themedStyles";
import { FONT, RADIUS, SPACE } from "@/utils/constants";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface AwardsProps {
  players: GameState["players"];
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

/**
 * End-game fun awards, computed from the per-player stats the host tracked.
 * Only categories where somebody actually did the thing are shown.
 */
export function Awards({ players }: AwardsProps) {
  const styles = useStyles();

  const awards = AWARD_DEFS.map((def) => {
    let best: GameState["players"][number] | null = null;
    let bestValue = 0;
    for (const p of players) {
      const value = def.value(p);
      if (value > bestValue) {
        best = p;
        bestValue = value;
      }
    }
    return best ? { def, player: best, value: bestValue } : null;
  }).filter((a): a is NonNullable<typeof a> => a !== null);

  if (awards.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Awards</Text>
      <View style={styles.grid}>
        {awards.map(({ def, player, value }) => (
          <View key={def.title} style={styles.card}>
            <Text style={styles.emoji}>{def.emoji}</Text>
            <Text style={styles.title}>{def.title}</Text>
            <Text style={styles.player} numberOfLines={1}>
              {player.name}
            </Text>
            <Text style={styles.caption}>{def.caption(value)}</Text>
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
