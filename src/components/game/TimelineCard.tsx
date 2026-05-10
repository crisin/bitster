import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { COLORS, SIZES } from "@/utils/constants";
import type { Song } from "@/game/types";

interface TimelineCardProps {
  song: Song;
  highlighted?: boolean;
  highlightColor?: string;
}

export function TimelineCard({
  song,
  highlighted = false,
  highlightColor = COLORS.success,
}: TimelineCardProps) {
  return (
    <View
      style={[
        styles.card,
        highlighted && { borderColor: highlightColor, borderWidth: 2 },
      ]}
    >
      <Text style={styles.year}>{song.year}</Text>
      <Text style={styles.title} numberOfLines={1}>
        {song.name}
      </Text>
      <Text style={styles.artist} numberOfLines={1}>
        {song.artist}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 14,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.borderRadiusLarge,
    minWidth: 100,
    maxWidth: 120,
  },
  year: {
    fontSize: SIZES.fontTitle,
    fontWeight: "700",
    color: COLORS.accent,
    marginBottom: 4,
  },
  title: {
    fontSize: SIZES.fontSmall,
    color: COLORS.textPrimary,
    textAlign: "center",
    maxWidth: 100,
  },
  artist: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: "center",
    maxWidth: 100,
    marginTop: 2,
  },
});
