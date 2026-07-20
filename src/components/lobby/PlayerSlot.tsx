import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { COLORS, FONT, RADIUS, SPACE } from "@/utils/constants";
import { StatusDot } from "@/components/ui/StatusDot";
import { Pressable } from "@/components/ui/Pressable";
import type { ConnectionStatus } from "@/p2p/store";

interface PlayerSlotProps {
  name: string;
  isHost: boolean;
  /** Pass-and-play player on the host's device */
  isLocal?: boolean;
  connectionStatus: ConnectionStatus;
  /** Shown as ✕ when provided (host removing a local player) */
  onRemove?: () => void;
}

export function PlayerSlot({
  name,
  isHost,
  isLocal = false,
  connectionStatus,
  onRemove,
}: PlayerSlotProps) {
  return (
    <View
      style={styles.container}
      accessibilityRole="text"
      accessibilityLabel={`${name}${isHost ? " (host)" : ""}${isLocal ? " (local player)" : `, ${connectionStatus}`}`}
    >
      <View style={styles.left}>
        {isHost && <Text style={styles.crown}>👑</Text>}
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {isLocal && (
          <View style={styles.localBadge}>
            <Text style={styles.localBadgeText}>local</Text>
          </View>
        )}
      </View>
      {isLocal ? (
        onRemove && (
          <Pressable
            onPress={onRemove}
            label={`Remove local player ${name}`}
            style={styles.removeBtn}
          >
            <Text style={styles.removeIcon}>✕</Text>
          </Pressable>
        )
      ) : (
        <StatusDot status={connectionStatus} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.md,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: SPACE["5xl"],
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    flex: 1,
  },
  crown: {
    fontSize: FONT.size.lg,
  },
  name: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.medium,
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  localBadge: {
    paddingHorizontal: SPACE.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgElevated,
  },
  localBadgeText: {
    fontSize: FONT.size.xs,
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  removeBtn: {
    minHeight: 36,
    minWidth: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  removeIcon: {
    fontSize: FONT.size.lg,
    color: COLORS.textSecondary,
  },
});
