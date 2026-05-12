import React from "react";
import { View, StyleSheet } from "react-native";
import { COLORS } from "@/utils/constants";
import type { ConnectionStatus } from "@/p2p/store";

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connected: COLORS.success,
  connecting: COLORS.warning,
  disconnected: COLORS.textSecondary,
  error: COLORS.error,
};

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: "Connected",
  connecting: "Connecting",
  disconnected: "Disconnected",
  error: "Connection error",
};

interface StatusDotProps {
  status: ConnectionStatus;
  size?: number;
}

export function StatusDot({ status, size = 10 }: StatusDotProps) {
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={STATUS_LABELS[status]}
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: STATUS_COLORS[status],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {},
});
