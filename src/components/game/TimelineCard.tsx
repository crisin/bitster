import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { COLORS, FONT, RADIUS, SPACE, LAYOUT } from "@/utils/constants";
import type { Song } from "@/game/types";

interface TimelineCardProps {
  song: Song;
  highlighted?: boolean;
  highlightColor?: string;
  hideYear?: boolean;
}

export function TimelineCard({
  song,
  highlighted = false,
  highlightColor = COLORS.success,
  hideYear = false,
}: TimelineCardProps) {
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={
        hideYear
          ? "Hidden song"
          : `${song.name} by ${song.artist}, ${song.year}`
      }
      style={[
        styles.card,
        highlighted && { borderColor: highlightColor, borderWidth: 2 },
        hideYear && styles.hiddenCard,
      ]}
    >
      {song.imageUrl ? (
        <Image source={{ uri: song.imageUrl }} style={styles.cover} />
      ) : (
        <View style={styles.coverPlaceholder}>
          <Text style={styles.coverIcon}>♫</Text>
        </View>
      )}
      <Text style={[styles.year, hideYear && styles.hiddenYear]}>
        {hideYear ? "?" : song.year}
      </Text>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {hideYear ? "???" : song.name}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {hideYear ? "???" : song.artist}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    width: "100%",
    maxWidth: LAYOUT.cardMaxWidth,
    gap: SPACE.md,
  },
  cover: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.xs,
    backgroundColor: COLORS.secondary,
  },
  coverPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.xs,
    backgroundColor: COLORS.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  coverIcon: {
    fontSize: FONT.size.lg,
    color: COLORS.textSecondary,
  },
  hiddenCard: {
    borderColor: COLORS.warning,
    borderWidth: 2,
    borderStyle: "dashed",
  },
  year: {
    fontSize: FONT.size["3xl"],
    fontWeight: FONT.weight.bold,
    color: COLORS.yearText,
    minWidth: 38,
  },
  hiddenYear: {
    color: COLORS.warning,
    fontSize: FONT.size["2xl"],
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: FONT.size.sm,
    color: COLORS.textPrimary,
  },
  artist: {
    fontSize: FONT.size.xs,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
});
