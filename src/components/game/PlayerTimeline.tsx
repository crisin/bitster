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
}

export function PlayerTimeline({
  name,
  songs,
  isCurrent,
  tokens,
  hiddenYearSongId,
}: PlayerTimelineProps) {
  const [expanded, setExpanded] = useState(isCurrent);

  return (
    <View style={[styles.container, isCurrent && styles.currentContainer]}>
      <Pressable
        onPress={() => setExpanded(!expanded)}
        label={`${name}'s timeline, ${songs.length} songs${isCurrent ? ", current turn" : ""}`}
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

      {expanded && songs.length > 0 && (
        <View style={styles.timeline}>
          {songs.map((song, index) => {
            const isHidden =
              !!hiddenYearSongId && song.id === hiddenYearSongId;
            return (
              <React.Fragment key={song.id}>
                {index > 0 && <Divider />}
                <View
                  style={styles.row}
                  accessibilityRole="text"
                  accessibilityLabel={
                    isHidden
                      ? "Hidden song"
                      : `${song.name}, ${song.year}`
                  }
                >
                  <Text
                    style={[styles.year, isHidden && styles.hiddenYear]}
                  >
                    {isHidden ? "?" : song.year}
                  </Text>
                  <Text style={styles.title} numberOfLines={1}>
                    {isHidden ? "???" : song.name}
                  </Text>
                </View>
              </React.Fragment>
            );
          })}
        </View>
      )}

      {expanded && songs.length === 0 && (
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
    gap: SPACE.md,
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
  title: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
    flex: 1,
  },
  empty: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingVertical: SPACE.sm,
  },
});

