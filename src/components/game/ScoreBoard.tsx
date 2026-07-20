import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Platform } from "react-native";
import { DISPLAY_FONT, FONT, RADIUS, SPACE } from "@/utils/constants";
import { createThemedStyles } from "@/theme/themedStyles";

const NATIVE_DRIVER = Platform.OS !== "web";

interface PlayerScore {
  id: string;
  name: string;
  score: number;
}

interface ScoreBoardProps {
  players: PlayerScore[];
  myId: string | null;
}

function Row({
  children,
  delay,
  style,
}: {
  children: React.ReactNode;
  delay: number;
  style?: object;
}) {
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(enter, {
      toValue: 1,
      friction: 7,
      tension: 50,
      delay,
      useNativeDriver: NATIVE_DRIVER,
    }).start();
  }, [enter, delay]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function ScoreBoard({ players, myId }: ScoreBoardProps) {
  const styles = useStyles();
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const [winner, ...rest] = sorted;

  if (!winner) return null;

  return (
    <View style={styles.container} accessibilityRole="list">
      {/* Winner hero */}
      <Row delay={200} style={styles.winnerCard}>
        <Text style={styles.trophy}>🏆</Text>
        <Text
          style={styles.winnerName}
          numberOfLines={1}
          accessibilityLabel={`Winner: ${winner.name}${winner.id === myId ? " (you)" : ""}, score ${winner.score}`}
        >
          {winner.name}
          {winner.id === myId ? " (you)" : ""}
        </Text>
        <Text style={styles.winnerScore}>{winner.score}</Text>
        <Text style={styles.winnerLabel}>songs on the timeline</Text>
      </Row>

      {rest.map((player, index) => {
        const isMe = player.id === myId;
        return (
          <Row key={player.id} delay={450 + index * 140} style={styles.row}>
            <Text style={styles.rank}>{index + 2}.</Text>
            <Text style={[styles.name, isMe && styles.nameMe]} numberOfLines={1}>
              {player.name}
              {isMe ? " (you)" : ""}
            </Text>
            <Text style={styles.score}>{player.score}</Text>
          </Row>
        );
      })}
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) => StyleSheet.create({
  container: {
    width: "100%",
    maxWidth: 360,
    gap: SPACE.sm,
  },
  winnerCard: {
    alignItems: "center",
    paddingVertical: SPACE["2xl"],
    paddingHorizontal: SPACE.xl,
    borderRadius: RADIUS.xl,
    borderWidth: 2,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentLight,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  trophy: {
    fontSize: 44,
  },
  winnerName: {
    fontFamily: DISPLAY_FONT,
    fontSize: 32,
    color: COLORS.textPrimary,
    letterSpacing: 1.5,
    marginTop: SPACE.sm,
  },
  winnerScore: {
    fontFamily: DISPLAY_FONT,
    fontSize: 56,
    lineHeight: 60,
    color: COLORS.accent,
    letterSpacing: 2,
  },
  winnerLabel: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
    gap: SPACE.sm,
  },
  rank: {
    fontFamily: DISPLAY_FONT,
    fontSize: FONT.size.xl,
    width: 28,
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
    fontFamily: DISPLAY_FONT,
    fontSize: FONT.size["2xl"],
    color: COLORS.textSecondary,
  },
}));
