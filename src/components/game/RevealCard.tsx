import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { Card } from "@/components/ui/Card";
import { COLORS, FONT, RADIUS, SPACE } from "@/utils/constants";
import type { Song } from "@/game/types";

interface RevealCardProps {
  correct: boolean;
  song: Song;
}

export function RevealCard({ correct, song }: RevealCardProps) {
  const color = correct ? COLORS.success : COLORS.error;
  const label = correct ? "Correct!" : "Wrong!";

  return (
    <Card
      borderColor={color}
      style={styles.card}
    >
      <Text
        style={[styles.result, { color }]}
        accessibilityRole="text"
        accessibilityLabel={`Result: ${label}`}
      >
        {label}
      </Text>
      {song.imageUrl != null && (
        <Image source={{ uri: song.imageUrl }} style={styles.cover} />
      )}
      <Text style={styles.title}>{song.name}</Text>
      <Text style={styles.artist}>{song.artist}</Text>
      <Text style={styles.year}>{song.year}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    padding: SPACE["3xl"],
    maxWidth: 320,
    borderWidth: 2,
  },
  result: {
    fontSize: FONT.size["4xl"],
    fontWeight: FONT.weight.extrabold,
    marginBottom: SPACE.lg,
  },
  cover: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.md,
    marginBottom: SPACE.lg,
    backgroundColor: COLORS.secondary,
  },
  title: {
    fontSize: FONT.size.xl,
    fontWeight: FONT.weight.semibold,
    color: COLORS.textPrimary,
    textAlign: "center",
    marginBottom: SPACE.xs,
  },
  artist: {
    fontSize: FONT.size.lg,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: SPACE.md,
  },
  year: {
    fontSize: FONT.size["5xl"],
    fontWeight: FONT.weight.black,
    color: COLORS.accent,
  },
});
