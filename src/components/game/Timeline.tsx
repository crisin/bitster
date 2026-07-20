import React, { useCallback } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import type { Song } from "@/game/types";
import { TimelineCard } from "./TimelineCard";
import { TimelineGap } from "./TimelineGap";
import { COLORS, FONT, SPACE } from "@/utils/constants";

interface TimelineProps {
  cards: Song[];
  interactive: boolean;
  selectedGap: number | null;
  onGapSelect: (position: number) => void;
  highlightedIndex?: number | null;
  highlightColor?: string;
  hiddenYearSongId?: string | null;
}

/**
 * A horizontal row of upright album cards with drop slots between them —
 * scales to any number of cards by scrolling sideways instead of growing
 * down the page.
 */
export function Timeline({
  cards,
  interactive,
  selectedGap,
  onGapSelect,
  highlightedIndex = null,
  highlightColor,
  hiddenYearSongId,
}: TimelineProps) {
  const handleGapPress = useCallback(
    (position: number) => {
      if (!interactive) return;
      onGapSelect(position);
    },
    [interactive, onGapSelect],
  );

  if (cards.length === 0 && interactive) {
    return (
      <View style={styles.emptyContainer}>
        <TimelineGap
          onPress={() => handleGapPress(0)}
          selected={selectedGap === 0}
          label="Place here"
        />
        <Text style={styles.emptyText}>First one's free — tap to place it</Text>
      </View>
    );
  }

  if (cards.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No songs yet</Text>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      {interactive && (
        <TimelineGap
          onPress={() => handleGapPress(0)}
          selected={selectedGap === 0}
        />
      )}

      {cards.map((song, index) => {
        const nextSong = cards[index + 1];
        // Group same-year cards: don't show a gap between them
        const sameYearAsNext =
          interactive && nextSong !== undefined && song.year === nextSong.year;

        return (
          <React.Fragment key={song.id}>
            <TimelineCard
              song={song}
              highlighted={highlightedIndex === index}
              highlightColor={highlightColor}
              hideYear={!!hiddenYearSongId && song.id === hiddenYearSongId}
            />
            {interactive && !sameYearAsNext && (
              <TimelineGap
                onPress={() => handleGapPress(index + 1)}
                selected={selectedGap === index + 1}
              />
            )}
          </React.Fragment>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    width: "100%",
    flexGrow: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
    // Centers when content is narrower than the viewport; becomes a no-op
    // (container = content width) once the row overflows and scrolls
    flexGrow: 1,
    justifyContent: "center",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACE.xl,
    gap: SPACE.md,
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: FONT.size.base,
  },
});
