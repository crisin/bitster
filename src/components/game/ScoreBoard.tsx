import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { COLORS } from "@/utils/constants";

interface PlayerScore {
  id: string;
  name: string;
  score: number;
}

interface ScoreBoardProps {
  players: PlayerScore[];
  myId: string | null;
}

export function ScoreBoard({ players, myId }: ScoreBoardProps) {
  const sorted = [...players].sort((a, b) => b.score - a.score);

  return (
    <View style={styles.container}>
      {sorted.map((player, index) => {
        const isWinner = index === 0;
        const isMe = player.id === myId;

        return (
          <View key={player.id} style={styles.row}>
            <Text style={styles.rank}>
              {isWinner ? "🏆" : `${index + 1}.`}
            </Text>
            <Text
              style={[styles.name, isMe && styles.nameMe]}
              numberOfLines={1}
            >
              {player.name}
              {isMe ? " (you)" : ""}
            </Text>
            <Text style={[styles.score, isWinner && styles.scoreWinner]}>
              {player.score}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    maxWidth: 300,
    gap: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  rank: {
    fontSize: 16,
    width: 30,
    color: COLORS.textSecondary,
  },
  name: {
    fontSize: 16,
    color: COLORS.textPrimary,
    flex: 1,
  },
  nameMe: {
    fontWeight: "700",
  },
  score: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.textSecondary,
  },
  scoreWinner: {
    color: COLORS.accent,
  },
});
