import { Chip } from "@/components/ui/Chip";
import { useGameStore } from "@/game/store";
import { BUZZ_TIMER_OPTIONS } from "@/game/types";
import { dispatch } from "@/p2p/connection";
import { LABEL_STYLE, SPACE } from "@/utils/constants";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

const WIN_SCORE_OPTIONS = [5, 10, 15, 20];

export function GameSettings() {
  const settings = useGameStore((s) => s.settings);

  const handleWinScore = (value: number) => {
    dispatch({ type: "update-settings", payload: { winScore: value } });
  };

  const handleBuzzTimer = (value: number) => {
    dispatch({
      type: "update-settings",
      payload: {
        rules: {
          ...settings.rules,
          buzz: { ...settings.rules.buzz, timerSeconds: value },
        },
      },
    });
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

      <Text style={styles.label}>bitster timer</Text>
      <View style={styles.row}>
        {BUZZ_TIMER_OPTIONS.map((n) => (
          <Chip
            key={n}
            label={`${n}s`}
            selected={settings.rules.buzz.timerSeconds === n}
            onPress={() => handleBuzzTimer(n)}
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
