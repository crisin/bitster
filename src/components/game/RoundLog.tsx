import type { StoredRound } from "@/history/types";
import { createThemedStyles } from "@/theme/themedStyles";
import { DISPLAY_FONT, FONT, RADIUS, SPACE } from "@/utils/constants";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface RoundLogProps {
  rounds: StoredRound[];
  /** Collapsed by default on the end screen, open on the stats page */
  initiallyOpen?: boolean;
}

const STAMP: Record<StoredRound["outcome"], { label: string; tone: Tone }> = {
  placed: { label: "NAILED IT", tone: "success" },
  timeout: { label: "TOO SLOW", tone: "error" },
  skipped: { label: "SKIPPED", tone: "muted" },
  abandoned: { label: "WALKED OFF", tone: "muted" },
};

type Tone = "success" | "error" | "muted";

function verdict(round: StoredRound): { label: string; tone: Tone } {
  if (round.outcome === "placed") {
    return round.correct
      ? { label: "NAILED IT", tone: "success" }
      : { label: "WRONG SPOT", tone: "error" };
  }
  return STAMP[round.outcome];
}

/**
 * The round-by-round story of one game: what played, who was up, and how it
 * went. Presentational only — it never reaches into a store.
 */
export function RoundLog({ rounds, initiallyOpen = false }: RoundLogProps) {
  const styles = useStyles();
  const [open, setOpen] = useState(initiallyOpen);

  if (rounds.length === 0) return null;

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={`${open ? "Hide" : "Show"} the round log`}
        style={styles.header}
      >
        <Text style={styles.headerText}>
          {open ? "▾" : "▸"} Round log ({rounds.length})
        </Text>
      </Pressable>

      {open &&
        rounds.map((round) => {
          const { label, tone } = verdict(round);
          return (
            <View key={round.round} style={styles.row}>
              <Text style={styles.year}>
                {round.song.year > 0 ? round.song.year : "????"}
              </Text>
              <View style={styles.middle}>
                <Text style={styles.song} numberOfLines={1}>
                  {round.song.name}
                </Text>
                <Text style={styles.artist} numberOfLines={1}>
                  {round.song.artist}
                </Text>
                <Text style={styles.who} numberOfLines={1}>
                  {round.activePlayerName}
                  {round.guess && !round.guess.titleCorrect
                    ? ` · guessed “${round.guess.title || "—"}”`
                    : ""}
                </Text>
                {round.buzz?.stolen && (
                  <Text style={styles.steal} numberOfLines={1}>
                    ⚡ stolen by {round.buzz.playerName}
                  </Text>
                )}
              </View>
              <Text style={[styles.stamp, styles[tone]]}>{label}</Text>
            </View>
          );
        })}
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) =>
  StyleSheet.create({
    container: {
      width: "100%",
      gap: SPACE.xs,
    },
    header: {
      paddingVertical: SPACE.sm,
      minHeight: 36,
      justifyContent: "center",
    },
    headerText: {
      fontSize: FONT.size.sm,
      fontWeight: FONT.weight.bold,
      color: COLORS.textSecondary,
      textTransform: "uppercase",
      letterSpacing: FONT.tracking.wider,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.md,
      paddingVertical: SPACE.sm,
      paddingHorizontal: SPACE.md,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgCard,
    },
    year: {
      fontFamily: DISPLAY_FONT,
      fontSize: 26,
      color: COLORS.yearText,
      minWidth: 62,
    },
    middle: {
      flex: 1,
      minWidth: 0,
    },
    song: {
      fontSize: FONT.size.base,
      fontWeight: FONT.weight.semibold,
      color: COLORS.textPrimary,
    },
    artist: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
    },
    who: {
      fontSize: FONT.size.xs,
      color: COLORS.textSecondary,
      opacity: 0.7,
    },
    steal: {
      fontSize: FONT.size.xs,
      color: COLORS.warning,
    },
    stamp: {
      fontFamily: DISPLAY_FONT,
      fontSize: 15,
      letterSpacing: 1,
      textAlign: "right",
      maxWidth: 96,
    },
    success: {
      color: COLORS.success,
    },
    error: {
      color: COLORS.error,
    },
    muted: {
      color: COLORS.textSecondary,
      opacity: 0.6,
    },
  }),
);
