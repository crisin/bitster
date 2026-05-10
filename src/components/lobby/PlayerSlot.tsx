import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { COLORS } from "@/utils/constants";
import { StatusDot } from "@/components/ui/StatusDot";
import type { ConnectionStatus } from "@/p2p/store";

interface PlayerSlotProps {
  name: string;
  isHost: boolean;
  connectionStatus: ConnectionStatus;
}

export function PlayerSlot({ name, isHost, connectionStatus }: PlayerSlotProps) {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        {isHost && <Text style={styles.crown}>👑</Text>}
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
      </View>
      <StatusDot status={connectionStatus} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: COLORS.bgCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  crown: {
    fontSize: 16,
  },
  name: {
    fontSize: 16,
    fontWeight: "500",
    color: COLORS.textPrimary,
  },
});
