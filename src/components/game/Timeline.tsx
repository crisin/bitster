import React, { useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import type { Song } from "@/game/types";
import { TimelineCard } from "./TimelineCard";
import { TimelineGap } from "./TimelineGap";
import { COLORS } from "@/utils/constants";

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    gap: 6,
    alignItems: "center",
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
