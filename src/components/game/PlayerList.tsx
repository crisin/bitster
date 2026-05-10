import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { COLORS, SIZES } from "@/utils/constants";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";

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
  return (
    <View style={styles.container}>
      {!compact && (
        <Text style={styles.title}>Players ({players.length})</Text>
      )}
      {players.map((player) => {
        const isActive = player.id === currentPlayerId;
        const isHost = player.id === hostId;
        const isMe = player.id === myId;

        return (
          <TouchableOpacity
            key={player.id}
            onPress={() => onPlayerPress?.(player.id)}
            disabled={!onPlayerPress}
            activeOpacity={0.7}
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
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  title: {
    fontSize: 12,
    textTransform: "uppercase",
    color: COLORS.textSecondary,
    marginBottom: 8,
    fontWeight: "600",
    letterSpacing: 1,
  },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 2,
  },
  itemActive: {
    backgroundColor: COLORS.secondary,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  crown: {
    fontSize: 14,
  },
  name: {
    fontSize: 15,
    color: COLORS.textPrimary,
    fontWeight: "500",
  },
  nameActive: {
    fontWeight: "700",
    color: COLORS.accent,
  },
  nameMe: {
    fontWeight: "700",
  },
  rightSide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  score: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.accent,
  },
  turnLabel: {
    fontSize: 12,
    color: COLORS.accent,
  },
});
