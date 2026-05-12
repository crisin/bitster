import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { COLORS, SIZES } from "@/utils/constants";
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
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.borderRadius,
    width: "100%",
    maxWidth: 360,
    gap: 10,
  },
  cover: {
    width: 36,
    height: 36,
    borderRadius: 4,
    backgroundColor: COLORS.secondary,
  },
  coverPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 4,
    backgroundColor: COLORS.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  coverIcon: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  hiddenCard: {
    borderColor: COLORS.warning,
    borderWidth: 2,
    borderStyle: "dashed",
  },
  year: {
    fontSize: SIZES.fontTitle,
    fontWeight: "700",
    color: COLORS.yearText,
    minWidth: 38,
  },
  hiddenYear: {
    color: COLORS.warning,
    fontSize: 22,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: SIZES.fontSmall,
    color: COLORS.textPrimary,
  },
  artist: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
});
