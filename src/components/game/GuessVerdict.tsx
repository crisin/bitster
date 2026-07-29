import { useGameStore } from "@/game/store";
import { guessReward, guessSongCorrect } from "@/game/logic";
import { createThemedStyles } from "@/theme/themedStyles";
import { FONT, RADIUS, SPACE } from "@/utils/constants";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface GuessVerdictProps {
  /**
   * "pending": the window — reward not paid yet, phrased as a promise.
   * "settled": the reveal — the tokens just landed.
   */
  stage: "pending" | "settled";
  /** Prefix, e.g. the guesser's name on the reveal (everyone sees it there) */
  who?: string;
}

/**
 * The guess verdict banner, shared by the bitster window and the reveal.
 * One component so the reward ALWAYS comes from the live game rules —
 * the old inline banner still assumed "title AND artist", which lies under
 * every other difficulty setting.
 */
export function GuessVerdict({ stage, who }: GuessVerdictProps) {
  const styles = useStyles();
  const guessResult = useGameStore((s) => s.guessResult);
  const rules = useGameStore((s) => s.settings.rules.guess);
  if (!guessResult) return null;

  const songHit = guessSongCorrect(guessResult, rules);
  const reward = guessReward(guessResult, rules);

  const parts = [
    guessResult.titleCorrect ? "✓ Title" : "✗ Title",
    guessResult.artistCorrect ? "✓ Artist" : "✗ Artist",
  ];
  if (guessResult.yearCorrect !== null) {
    parts.push(guessResult.yearCorrect ? "✓ Year" : "✗ Year");
  }
  const stars =
    reward > 0
      ? stage === "pending"
        ? `  +${reward}★ at reveal`
        : `  +${reward}★`
      : "";

  return (
    <View
      style={[
        styles.banner,
        songHit || reward > 0 ? styles.success : styles.partial,
      ]}
      accessibilityRole="alert"
    >
      <Text style={styles.text}>
        {who ? `${who}: ` : ""}
        {parts.join("  ")}
        {stars}
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) =>
  StyleSheet.create({
    banner: {
      paddingVertical: SPACE.sm,
      paddingHorizontal: SPACE.md,
      borderRadius: RADIUS.md,
      borderWidth: 1,
    },
    success: {
      borderColor: COLORS.success,
      backgroundColor: COLORS.successLight,
    },
    partial: {
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgCard,
    },
    text: {
      fontSize: FONT.size.sm,
      fontWeight: FONT.weight.semibold,
      color: COLORS.textPrimary,
      textAlign: "center",
      letterSpacing: 0.5,
    },
  }),
);
