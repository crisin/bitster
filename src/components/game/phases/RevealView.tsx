import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useGameStore } from "@/game/store";
import { useCurrentPlayer } from "@/hooks/useCurrentPlayer";
import { Timeline } from "@/components/game/Timeline";
import { RevealCard } from "@/components/game/RevealCard";
import { AllPlayerTimelines } from "@/components/game/AllPlayerTimelines";
import { SPACE, LABEL_STYLE } from "@/utils/constants";

export function RevealView() {
  const lastResult = useGameStore((s) => s.lastResult);
  const { myTimeline } = useCurrentPlayer();

  if (!lastResult) return null;

  return (
    <View style={styles.container}>
      <RevealCard correct={lastResult.correct} song={lastResult.song} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Timeline</Text>
        <Timeline
          cards={myTimeline}
          interactive={false}
          selectedGap={null}
          onGapSelect={() => {}}
        />
      </View>

      <AllPlayerTimelines />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: SPACE["2xl"],
    width: "100%",
  },
  section: {
    width: "100%",
    gap: SPACE.sm,
  },
  sectionTitle: {
    ...LABEL_STYLE,
    marginBottom: SPACE.xs,
  },
});
