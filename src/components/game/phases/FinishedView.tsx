import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useGameStore } from "@/game/store";
import { useP2PStore } from "@/p2p/store";
import { ScoreBoard } from "@/components/game/ScoreBoard";
import { COLORS, FONT, SPACE } from "@/utils/constants";

export function FinishedView() {
  const players = useGameStore((s) => s.players);
  const myPeerId = useP2PStore((s) => s.myPeerId);

  return (
    <View style={styles.container}>
      <Text style={styles.gameOverTitle}>Game Over!</Text>
      <ScoreBoard players={players} myId={myPeerId} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: SPACE["2xl"],
    width: "100%",
  },
  gameOverTitle: {
    fontSize: FONT.size["6xl"],
    fontWeight: FONT.weight.black,
    color: COLORS.textPrimary,
    textAlign: "center",
  },
});
