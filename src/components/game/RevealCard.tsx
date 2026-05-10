import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { COLORS, SIZES } from "@/utils/constants";
import type { Song } from "@/game/types";

interface RevealCardProps {
  correct: boolean;
  song: Song;
}

export function RevealCard({ correct, song }: RevealCardProps) {
  const color = correct ? COLORS.success : COLORS.error;
  const label = correct ? "Correct!" : "Wrong!";

  return (
    <View style={[styles.card, { borderColor: color }]}>
      <Text style={[styles.result, { color }]}>{label}</Text>
      <Text style={styles.title}>{song.name}</Text>
      <Text style={styles.artist}>{song.artist}</Text>
      <Text style={styles.year}>{song.year}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    padding: 32,
    borderRadius: 16,
    borderWidth: 2,
    backgroundColor: COLORS.bgCard,
    width: "100%",
    maxWidth: 320,
  },
  result: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.textPrimary,
    textAlign: "center",
    marginBottom: 4,
  },
  artist: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: 12,
  },
  year: {
    fontSize: SIZES.fontHuge,
    fontWeight: "900",
    color: COLORS.accent,
  },
});
