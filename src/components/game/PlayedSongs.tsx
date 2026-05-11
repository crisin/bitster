import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { COLORS, SIZES } from "@/utils/constants";

interface PlayedSongInfo {
  name: string;
  artist: string;
  year: number;
}

interface PlayedSongsProps {
  songs: PlayedSongInfo[];
}

export function PlayedSongs({ songs }: PlayedSongsProps) {
  const [expanded, setExpanded] = useState(false);

  if (songs.length === 0) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
        style={styles.header}
      >
        <Text style={styles.headerText}>
          Played ({songs.length})
        </Text>
        <Text style={styles.chevron}>{expanded ? "▲" : "▼"}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.list}>
          {songs.map((song, i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.year}>{song.year}</Text>
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>
                  {song.name}
                </Text>
                <Text style={styles.artist} numberOfLines={1}>
                  {song.artist}
                </Text>
              </View>
            </View>
          ))}
        </View>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: COLORS.bgCard,
  },
  headerText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  chevron: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  list: {
    backgroundColor: COLORS.bgPrimary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 12,
  },
  year: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.yearText,
    width: 40,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  artist: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
});
