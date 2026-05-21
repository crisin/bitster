import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import type { Song } from "@/game/types";
import { Pressable } from "@/components/ui/Pressable";
import { Divider } from "@/components/ui/Divider";
import { COLORS, FONT, RADIUS, SPACE, TOUCH } from "@/utils/constants";

interface PlayerTimelineProps {
  name: string;
  songs: Song[];
  isCurrent: boolean;
  tokens: number;
  hiddenYearSongId?: string | null;
  failedSongs?: Song[];
}

export function PlayerTimeline({
  name,
  songs,
  isCurrent,
  tokens,
  hiddenYearSongId,
  failedSongs = [],
}: PlayerTimelineProps) {
  const [expanded, setExpanded] = useState(isCurrent);

  // Merge correct + failed songs, sorted by year, with a flag
  const allSongs: Array<Song & { failed: boolean }> = [
    ...songs.map((s) => ({ ...s, failed: false })),
    ...failedSongs.map((s) => ({ ...s, failed: true })),
  ].sort((a, b) => a.year - b.year);

  return (
    <View style={[styles.container, isCurrent && styles.currentContainer]}>
      <Pressable
        onPress={() => setExpanded(!expanded)}
        label={`${name}'s timeline, ${songs.length} songs${failedSongs.length > 0 ? `, ${failedSongs.length} failed` : ""}${isCurrent ? ", current turn" : ""}`}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          {isCurrent && <Text style={styles.turnDot}>●</Text>}
          <Text style={[styles.name, isCurrent && styles.currentName]}>
            {name}
          </Text>
          <View style={styles.countBadge}>
            <Text style={styles.count}>{songs.length}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {tokens > 0 && (
            <Text style={styles.tokens} accessibilityLabel={`${tokens} tokens`}>
              {"★".repeat(tokens)}
            </Text>
          )}
          <Text style={styles.chevron}>{expanded ? "▲" : "▼"}</Text>
        </View>
      </Pressable>

      {expanded && allSongs.length > 0 && (
        <View style={styles.timeline}>
          {allSongs.map((song, index) => {
            const isHidden =
              !!hiddenYearSongId && song.id === hiddenYearSongId;
            return (
              <React.Fragment key={`${song.id}-${song.failed ? "f" : "s"}`}>
                {index > 0 && <Divider />}
                <View
                  style={[styles.row, song.failed && styles.failedRow]}
                  accessibilityRole="text"
                  accessibilityLabel={
                    isHidden
                      ? "Hidden song"
                      : song.failed
                        ? `${song.name} by ${song.artist}, ${song.year} (incorrect)`
                        : `${song.name} by ${song.artist}, ${song.year}`
                  }
                >
                  {song.failed && (
                    <Text style={styles.failedIcon}>✗</Text>
                  )}
                  <Text
                    style={[
                      styles.year,
                      isHidden && styles.hiddenYear,
                      song.failed && styles.failedText,
                    ]}
                  >
                    {isHidden ? "?" : song.year}
                  </Text>
                  <View style={styles.songInfo}>
                    <Text
                      style={[styles.title, song.failed && styles.failedText]}
                      numberOfLines={1}
                    >
                      {isHidden ? "???" : song.name}
                    </Text>
                    <Text
                      style={[styles.artist, song.failed && styles.failedText]}
                      numberOfLines={1}
                    >
                      {isHidden ? "???" : song.artist}
                    </Text>
                  </View>
                </View>
              </React.Fragment>
            );
          })}
        </View>
      )}

      {expanded && allSongs.length === 0 && (
        <Text style={styles.empty}>No songs yet</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  currentContainer: {
    borderColor: COLORS.accent,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
    backgroundColor: COLORS.bgCard,
    minHeight: TOUCH.minHeight,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
  },
  turnDot: {
    color: COLORS.accent,
    fontSize: FONT.size.xs,
  },
  name: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.semibold,
    color: COLORS.textPrimary,
  },
  currentName: {
    color: COLORS.accent,
  },
  countBadge: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 1,
    borderRadius: RADIUS.xs,
  },
  count: {
    fontSize: FONT.size.xs,
    color: COLORS.textSecondary,
  },
  tokens: {
    fontSize: FONT.size.sm,
    color: COLORS.warning,
  },
  chevron: {
    fontSize: FONT.size.xs,
    color: COLORS.textSecondary,
  },
  timeline: {
    backgroundColor: COLORS.bgPrimary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACE.xs + 1,
    paddingHorizontal: SPACE.md,
    gap: SPACE.sm,
  },
  failedRow: {
    opacity: 0.45,
  },
  failedIcon: {
    fontSize: FONT.size.xs,
    color: COLORS.error,
    width: 14,
  },
  year: {
    fontSize: FONT.size.sm,
    fontWeight: FONT.weight.bold,
    color: COLORS.yearText,
    width: 36,
  },
  hiddenYear: {
    color: COLORS.warning,
  },
  failedText: {
    textDecorationLine: "line-through",
  },
  songInfo: {
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
  empty: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingVertical: SPACE.sm,
  },
});
