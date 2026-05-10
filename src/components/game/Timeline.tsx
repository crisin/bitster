import React, { useRef, useCallback } from "react";
import { ScrollView, View, Text, StyleSheet } from "react-native";
import type { Song } from "@/game/types";
import { TimelineCard } from "./TimelineCard";
import { TimelineGap } from "./TimelineGap";
import { COLORS, SIZES } from "@/utils/constants";

interface TimelineProps {
  cards: Song[];
  interactive: boolean;
  selectedGap: number | null;
  onGapSelect: (position: number) => void;
  highlightedIndex?: number | null;
  highlightColor?: string;
}

export function Timeline({
  cards,
  interactive,
  selectedGap,
  onGapSelect,
  highlightedIndex = null,
  highlightColor,
}: TimelineProps) {
  const scrollRef = useRef<ScrollView>(null);

  const handleGapPress = useCallback(
    (position: number) => {
      if (!interactive) return;
      onGapSelect(position);
    },
    [interactive, onGapSelect]
  );

  if (cards.length === 0 && interactive) {
    return (
      <View style={styles.emptyContainer}>
        <TimelineGap
          onPress={() => handleGapPress(0)}
          selected={selectedGap === 0}
          label="Place here"
        />
        <Text style={styles.emptyText}>Tap to place your first song</Text>
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
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.track}
      >
        {interactive && (
          <TimelineGap
            onPress={() => handleGapPress(0)}
            selected={selectedGap === 0}
          />
        )}

        {cards.map((song, index) => (
          <React.Fragment key={song.id}>
            <TimelineCard
              song={song}
              highlighted={highlightedIndex === index}
              highlightColor={highlightColor}
            />
            {interactive && (
              <TimelineGap
                onPress={() => handleGapPress(index + 1)}
                selected={selectedGap === index + 1}
              />
            )}
          </React.Fragment>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  track: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    gap: 12,
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
});
