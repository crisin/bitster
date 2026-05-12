import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Chip } from "@/components/ui/Chip";
import { useGameStore } from "@/game/store";
import { dispatch } from "@/p2p/connection";
import { SPACE, LABEL_STYLE } from "@/utils/constants";

const WIN_SCORE_OPTIONS = [5, 10, 15, 20];

export function GameSettings() {
  const settings = useGameStore((s) => s.settings);

  const handleWinScore = (value: number) => {
    dispatch({ type: "update-settings", payload: { winScore: value } });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Win at</Text>
      <View style={styles.row}>
        {WIN_SCORE_OPTIONS.map((n) => (
          <Chip
            key={n}
            label={`${n} songs`}
            selected={settings.winScore === n}
            onPress={() => handleWinScore(n)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    gap: SPACE.sm,
  },
  label: {
    ...LABEL_STYLE,
  },
  row: {
    flexDirection: "row",
    gap: SPACE.sm,
    flexWrap: "wrap",
  },
});
