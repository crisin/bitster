import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { Song } from "@/game/types";
import { COLORS, SIZES } from "@/utils/constants";

interface PlayerTimelineProps {
  name: string;
  songs: Song[];
  isCurrent: boolean;
  tokens: number;
}

export function PlayerTimeline({ name, songs, isCurrent, tokens }: PlayerTimelineProps) {
  const [expanded, setExpanded] = useState(isCurrent);

  return (
    <View style={[styles.container, isCurrent && styles.currentContainer]}>
      <TouchableOpacity
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          {isCurrent && <Text style={styles.turnDot}>●</Text>}
          <Text style={[styles.name, isCurrent && styles.currentName]}>
            {name}
          </Text>
          <Text style={styles.count}>{songs.length}</Text>
        </View>
        <View style={styles.headerRight}>
          {tokens > 0 && (
            <Text style={styles.tokens}>
              {"★".repeat(tokens)}
            </Text>
          )}
          <Text style={styles.chevron}>{expanded ? "▲" : "▼"}</Text>
        </View>
      </TouchableOpacity>

      {expanded && songs.length > 0 && (
        <View style={styles.timeline}>
          {songs.map((song, i) => (
            <View key={song.id} style={styles.row}>
              <Text style={styles.year}>{song.year}</Text>
              <Text style={styles.title} numberOfLines={1}>{song.name}</Text>
            </View>
          ))}
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
    borderRadius: SIZES.borderRadius,
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
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: COLORS.bgCard,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  turnDot: {
    color: COLORS.accent,
    fontSize: 10,
  },
  name: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  currentName: {
    color: COLORS.accent,
  },
  count: {
    fontSize: 11,
    color: COLORS.textSecondary,
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: "hidden",
  },
  tokens: {
    fontSize: 12,
    color: COLORS.warning,
  },
  chevron: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  timeline: {
    backgroundColor: COLORS.bgPrimary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 10,
  },
  year: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.yearText,
    width: 36,
  },
  title: {
    fontSize: 12,
    color: COLORS.textSecondary,
    flex: 1,
  },
  empty: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingVertical: 8,
  },
});
