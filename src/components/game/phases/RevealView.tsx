import React from "react";
import { View, StyleSheet } from "react-native";
import { useGameStore } from "@/game/store";
import { RevealCard } from "@/components/game/RevealCard";
import { AllPlayerTimelines } from "@/components/game/AllPlayerTimelines";
import { SPACE } from "@/utils/constants";

export function RevealView() {
  const lastResult = useGameStore((s) => s.lastResult);

  if (!lastResult) return null;

  return (
    <View style={styles.container}>
      <RevealCard correct={lastResult.correct} song={lastResult.song} />
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
});
