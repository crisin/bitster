import { tokenLedger } from "@/history/aggregate";
import type { StoredRound } from "@/history/types";
import { createThemedStyles } from "@/theme/themedStyles";
import { FONT, RADIUS, SPACE } from "@/utils/constants";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface TokenLedgerProps {
  rounds: StoredRound[];
  /** Highlights the row of the player reading this */
  meId?: string | null;
}

/**
 * Where every bitster token went this game: earned by guessing, spent buzzing
 * or skipping. Derived from the round log — no second bookkeeping to drift.
 *
 * Renders nothing for games recorded before the log tracked tokens, which is
 * the honest answer: those numbers were never written down.
 */
export function TokenLedger({ rounds, meId }: TokenLedgerProps) {
  const styles = useStyles();
  const rows = tokenLedger(rounds);
  if (rows.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>★ bitster tokens</Text>
      {rows.map((row) => {
        const detail = [
          row.guessedSong > 0 ? `💡${row.guessedSong}` : null,
          row.guessedYear > 0 ? `📅${row.guessedYear}` : null,
          row.buzzes > 0 ? `⚡${row.buzzes}` : null,
          row.skips > 0 ? `⏭️${row.skips}` : null,
        ]
          .filter(Boolean)
          .join("  ");
        return (
          <View
            key={row.playerId}
            style={[styles.row, row.playerId === meId && styles.rowMine]}
          >
            <Text style={styles.name} numberOfLines={1}>
              {row.name || "—"}
            </Text>
            <Text style={styles.detail} numberOfLines={1}>
              {detail}
            </Text>
            <Text style={[styles.figure, styles.earned]}>+{row.earned}</Text>
            <Text style={[styles.figure, styles.spent]}>−{row.spent}</Text>
            <Text
              style={[
                styles.net,
                row.net > 0 ? styles.earned : row.net < 0 ? styles.spent : styles.flat,
              ]}
            >
              {row.net > 0 ? `+${row.net}` : row.net < 0 ? `−${-row.net}` : "0"}
            </Text>
          </View>
        );
      })}
      <Text style={styles.legend}>
        earned by guessing · spent on bitsters and skips
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) =>
  StyleSheet.create({
    container: {
      width: "100%",
      gap: SPACE.xs,
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgCard,
    },
    title: {
      fontSize: FONT.size.sm,
      fontWeight: FONT.weight.bold,
      color: COLORS.textSecondary,
      textTransform: "uppercase",
      letterSpacing: FONT.tracking.wider,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.sm,
      paddingVertical: 4,
      paddingHorizontal: SPACE.xs,
      borderRadius: RADIUS.sm,
    },
    rowMine: {
      backgroundColor: COLORS.accentLight,
    },
    name: {
      flex: 1,
      minWidth: 0,
      fontSize: FONT.size.sm,
      fontWeight: FONT.weight.semibold,
      color: COLORS.textPrimary,
    },
    detail: {
      fontSize: FONT.size.xs,
      color: COLORS.textSecondary,
      opacity: 0.8,
    },
    figure: {
      width: 32,
      textAlign: "right",
      fontSize: FONT.size.sm,
      fontVariant: ["tabular-nums"],
    },
    net: {
      width: 36,
      textAlign: "right",
      fontSize: FONT.size.sm,
      fontWeight: FONT.weight.bold,
      fontVariant: ["tabular-nums"],
    },
    earned: {
      color: COLORS.success,
    },
    spent: {
      color: COLORS.error,
    },
    flat: {
      color: COLORS.textSecondary,
    },
    legend: {
      fontSize: FONT.size.xs,
      color: COLORS.textSecondary,
      opacity: 0.7,
    },
  }),
);
