import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useGameStore } from "@/game/store";
import { dispatch } from "@/p2p/connection";
import { COLORS, SIZES } from "@/utils/constants";

const WIN_SCORE_OPTIONS = [5, 10, 15, 20];

export function GameSettings() {
  const settings = useGameStore((s) => s.settings);

  const handleWinScore = (value: number) => {
    dispatch({ type: "update-settings", payload: { winScore: value } });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Win at</Text>
      <View style={styles.row}>
        {WIN_SCORE_OPTIONS.map((n) => (
          <TouchableOpacity
            key={n}
            style={[styles.chip, settings.winScore === n && styles.chipActive]}
            onPress={() => handleWinScore(n)}
            activeOpacity={0.6}
          >
            <Text
              style={[
                styles.chipText,
                settings.winScore === n && styles.chipTextActive,
              ]}
            >
              {n} songs
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    gap: 8,
  },
  label: {
    fontSize: 12,
    textTransform: "uppercase",
    color: COLORS.textSecondary,
    fontWeight: "600",
    letterSpacing: 1,
  },
  row: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: SIZES.borderRadius,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  chipText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  chipTextActive: {
    color: COLORS.textPrimary,
    fontWeight: "600",
  },
});
