import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useGameStore } from "@/game/store";
import { useP2PStore } from "@/p2p/store";
import { RevealCard } from "@/components/game/RevealCard";
import { AllPlayerTimelines } from "@/components/game/AllPlayerTimelines";
import { createThemedStyles } from "@/theme/themedStyles";
import { DISPLAY_FONT, SPACE } from "@/utils/constants";

export function RevealView() {
  const styles = useStyles();
  const lastResult = useGameStore((s) => s.lastResult);
  const players = useGameStore((s) => s.players);
  const myPeerId = useP2PStore((s) => s.myPeerId);

  if (!lastResult) return null;

  // undefined = an older host that doesn't report the winner at all; null = it
  // reported that nobody kept the card. Only the second deserves a line.
  const awardedTo = lastResult.awardedTo;
  const winner =
    awardedTo != null ? players.find((p) => p.id === awardedTo) : null;
  const showOutcome = awardedTo !== undefined;

  return (
    <View style={styles.container}>
      <RevealCard
        correct={lastResult.correct}
        song={lastResult.song}
        timedOut={lastResult.timedOut}
      />

      {showOutcome && (
        <Text style={[styles.outcome, winner ? styles.won : styles.lost]}>
          {winner
            ? `🃏 ${winner.id === myPeerId ? "You keep" : `${winner.name} keeps`} the card`
            : "🗑 Nobody gets the card"}
        </Text>
      )}

      <AllPlayerTimelines />
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) =>
  StyleSheet.create({
    container: {
      alignItems: "center",
      gap: SPACE["2xl"],
      width: "100%",
    },
    outcome: {
      fontFamily: DISPLAY_FONT,
      fontSize: 26,
      letterSpacing: 2,
      textAlign: "center",
    },
    won: {
      color: COLORS.success,
    },
    lost: {
      color: COLORS.textSecondary,
    },
  }),
);
