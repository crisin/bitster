import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { COLORS, FONT, RADIUS, SPACE } from "@/utils/constants";

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
    <View style={styles.container} accessibilityRole="list">
      {sorted.map((player, index) => {
        const isWinner = index === 0;
        const isMe = player.id === myId;

        return (
          <View
            key={player.id}
            style={[styles.row, isWinner && styles.rowWinner]}
            accessibilityRole="text"
            accessibilityLabel={`${isWinner ? "Winner: " : ""}${player.name}${isMe ? " (you)" : ""}, score ${player.score}`}
          >
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
    maxWidth: 320,
    gap: SPACE.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.sm,
    gap: SPACE.sm,
  },
  rowWinner: {
    backgroundColor: COLORS.accentLight,
  },
  rank: {
    fontSize: FONT.size.lg,
    width: 30,
    color: COLORS.textSecondary,
  },
  name: {
    fontSize: FONT.size.lg,
    color: COLORS.textPrimary,
    flex: 1,
  },
  nameMe: {
    fontWeight: FONT.weight.bold,
  },
  score: {
    fontSize: FONT.size.xl,
    fontWeight: FONT.weight.bold,
    color: COLORS.textSecondary,
  },
  scoreWinner: {
    color: COLORS.accent,
  },
});
