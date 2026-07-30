import React, { useCallback } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import type { Song } from "@/game/types";
import { TimelineCard } from "./TimelineCard";
import { TimelineGap } from "./TimelineGap";
import { FONT, SPACE } from "@/utils/constants";
import { createThemedStyles } from "@/theme/themedStyles";

interface TimelineProps {
  cards: Song[];
  interactive: boolean;
  selectedGap: number | null;
  onGapSelect: (position: number) => void;
  highlightedIndex?: number | null;
  highlightColor?: string;
  hiddenYearSongId?: string | null;
  /**
   * Gap the active player dropped the disputed card into. Rendered as the
   * mystery card instead of an empty slot, and not selectable.
   */
  disputedGap?: number | null;
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
  disputedGap = null,
}: TimelineProps) {
  const styles = useStyles();
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
          position={0}
          onPress={handleGapPress}
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
          position={0}
          onPress={handleGapPress}
          selected={selectedGap === 0}
          disputed={disputedGap === 0}
        />
      )}

      {cards.map((song, index) => {
        const nextSong = cards[index + 1];
        const gap = index + 1;
        // Group same-year cards: don't show a gap between them — unless the
        // disputed card sits there, which the challenger has to see
        const sameYearAsNext =
          interactive &&
          nextSong !== undefined &&
          song.year === nextSong.year &&
          disputedGap !== gap;

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
                position={gap}
                onPress={handleGapPress}
                selected={selectedGap === gap}
                disputed={disputedGap === gap}
              />
            )}
          </React.Fragment>
        );
      })}
    </ScrollView>
  );
}

const useStyles = createThemedStyles((COLORS) => StyleSheet.create({
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
}));
