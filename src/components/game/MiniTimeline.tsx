import React from "react";
import { View, Text, Image, ScrollView, StyleSheet } from "react-native";
import type { Song } from "@/game/types";
import { DISPLAY_FONT, FONT, RADIUS, SPACE } from "@/utils/constants";
import { createThemedStyles } from "@/theme/themedStyles";

export interface MiniSong extends Song {
  failed?: boolean;
}

interface MiniTimelineProps {
  songs: MiniSong[];
  hiddenYearSongId?: string | null;
}

/**
 * A player's timeline at a glance: tiny year chips over the album art,
 * in chronological order. Failed placements show crossed out.
 */
export function MiniTimeline({ songs, hiddenYearSongId }: MiniTimelineProps) {
  const styles = useStyles();
  if (songs.length === 0) {
    return <Text style={styles.empty}>No songs yet</Text>;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      {songs.map((song) => {
        const hidden = !!hiddenYearSongId && song.id === hiddenYearSongId;
        return (
          <View
            key={`${song.id}-${song.failed ? "f" : "s"}`}
            accessibilityRole="text"
            accessibilityLabel={
              hidden
                ? "Mystery song"
                : `${song.name}, ${song.year}${song.failed ? " (incorrect)" : ""}`
            }
            style={[
              styles.chip,
              hidden && styles.chipHidden,
              song.failed && styles.chipFailed,
            ]}
          >
            {song.imageUrl && !hidden ? (
              <Image source={{ uri: song.imageUrl }} style={styles.chipCover} />
            ) : null}
            <View style={styles.chipShade} />
            <Text
              style={[
                styles.chipYear,
                hidden && styles.chipYearHidden,
                song.failed && styles.chipYearFailed,
              ]}
            >
              {hidden ? "?" : song.year}
            </Text>
            {song.failed && <Text style={styles.failedMark}>✗</Text>}
          </View>
        );
      })}
    </ScrollView>
  );
}

const useStyles = createThemedStyles((COLORS) => StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  row: {
    flexDirection: "row",
    gap: SPACE.xs,
    paddingVertical: 2,
  },
  chip: {
    width: 48,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.secondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  chipHidden: {
    borderColor: COLORS.warning,
    borderStyle: "dashed",
    backgroundColor: COLORS.bgElevated,
  },
  chipFailed: {
    borderColor: COLORS.error,
    opacity: 0.55,
  },
  chipCover: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  chipShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10, 14, 24, 0.55)",
  },
  chipYear: {
    fontFamily: DISPLAY_FONT,
    fontSize: FONT.size.lg,
    color: COLORS.yearText,
    letterSpacing: 0.5,
  },
  chipYearHidden: {
    color: COLORS.warning,
    fontSize: FONT.size.xl,
  },
  chipYearFailed: {
    textDecorationLine: "line-through",
    color: COLORS.error,
  },
  failedMark: {
    position: "absolute",
    top: 1,
    right: 3,
    fontSize: 9,
    color: COLORS.error,
  },
  empty: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
    opacity: 0.7,
    paddingVertical: SPACE.xs,
  },
}));
