import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { FONT, RADIUS, SPACE, LABEL_STYLE } from "@/utils/constants";
import { createThemedStyles } from "@/theme/themedStyles";

interface PlayerInfo {
  id: string;
  name: string;
  score: number;
  timelineLength: number;
}

interface PlayerListProps {
  players: PlayerInfo[];
  currentPlayerId: string | null;
  hostId: string | null;
  myId: string | null;
  onPlayerPress?: (playerId: string) => void;
  compact?: boolean;
}

export function PlayerList({
  players,
  currentPlayerId,
  hostId,
  myId,
  onPlayerPress,
  compact = false,
}: PlayerListProps) {
  const styles = useStyles();
  return (
    <View style={styles.container} accessibilityRole="list">
      {!compact && (
        <Text style={styles.title}>Players ({players.length})</Text>
      )}
      {players.map((player) => {
        const isActive = player.id === currentPlayerId;
        const isHost = player.id === hostId;
        const isMe = player.id === myId;

        return (
          <Pressable
            key={player.id}
            onPress={() => onPlayerPress?.(player.id)}
            disabled={!onPlayerPress}
            label={`${player.name}${isMe ? " (you)" : ""}${isActive ? ", current turn" : ""}, score ${player.score}`}
            style={[styles.item, isActive && styles.itemActive]}
          >
            <View style={styles.nameRow}>
              {isHost && <Text style={styles.crown}>👑</Text>}
              <Text
                style={[
                  styles.name,
                  isActive && styles.nameActive,
                  isMe && styles.nameMe,
                ]}
                numberOfLines={1}
              >
                {player.name}
                {isMe ? " (you)" : ""}
              </Text>
            </View>
            <View style={styles.rightSide}>
              <Text style={styles.score}>{player.score}</Text>
              {isActive && <Text style={styles.turnLabel}>◀</Text>}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) => StyleSheet.create({
  container: {},
  title: {
    ...LABEL_STYLE,
    color: COLORS.textSecondary,
    marginBottom: SPACE.sm,
  },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.sm,
    marginBottom: 2,
    minHeight: 44,
  },
  itemActive: {
    backgroundColor: COLORS.secondary,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    flex: 1,
  },
  crown: {
    fontSize: FONT.size.base,
  },
  name: {
    fontSize: FONT.size.md,
    color: COLORS.textPrimary,
    fontWeight: FONT.weight.medium,
  },
  nameActive: {
    fontWeight: FONT.weight.bold,
    color: COLORS.accent,
  },
  nameMe: {
    fontWeight: FONT.weight.bold,
  },
  rightSide: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
  },
  score: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.bold,
    color: COLORS.accent,
  },
  turnLabel: {
    fontSize: FONT.size.sm,
    color: COLORS.accent,
  },
}));
