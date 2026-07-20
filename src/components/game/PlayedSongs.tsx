import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { Divider } from "@/components/ui/Divider";
import { FONT, RADIUS, SPACE, LABEL_STYLE } from "@/utils/constants";
import { createThemedStyles } from "@/theme/themedStyles";

interface PlayedSongInfo {
  name: string;
  artist: string;
  year: number;
}

interface PlayedSongsProps {
  songs: PlayedSongInfo[];
}

export function PlayedSongs({ songs }: PlayedSongsProps) {
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);

  if (songs.length === 0) return null;

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => setExpanded(!expanded)}
        label={`${expanded ? "Collapse" : "Expand"} played songs list`}
        style={styles.header}
      >
        <Text style={styles.headerText}>
          Played ({songs.length})
        </Text>
        <Text style={styles.chevron}>{expanded ? "▲" : "▼"}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.list}>
          {songs.map((song, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Divider />}
              <View
                style={styles.row}
                accessibilityRole="text"
                accessibilityLabel={`${song.name} by ${song.artist}, ${song.year}`}
              >
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
            </React.Fragment>
          ))}
        </View>
      )}
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) => StyleSheet.create({
  container: {
    width: "100%",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    backgroundColor: COLORS.bgCard,
    minHeight: SPACE["5xl"],
  },
  headerText: {
    ...LABEL_STYLE,
    color: COLORS.textSecondary,
  },
  chevron: {
    fontSize: FONT.size.xs,
    color: COLORS.textSecondary,
  },
  list: {
    backgroundColor: COLORS.bgPrimary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    gap: SPACE.md,
  },
  year: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.bold,
    color: COLORS.yearText,
    width: 40,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: FONT.size.base,
    color: COLORS.textPrimary,
  },
  artist: {
    fontSize: FONT.size.xs,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
}));
