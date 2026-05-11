import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Button } from "@/components/ui/Button";
import { COLORS } from "@/utils/constants";
import { useStreamingStore } from "@/streaming/store";

interface ConnectButtonProps {
  providerName: string;
  providerColor: string;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function ConnectButton({
  providerName,
  providerColor,
  onConnect,
  onDisconnect,
}: ConnectButtonProps) {
  const authStatus = useStreamingStore((s) => s.authStatus);

  if (authStatus === "authenticated") {
    return (
      <View style={styles.connected}>
        <View style={styles.connectedRow}>
          <View style={[styles.dot, { backgroundColor: providerColor }]} />
          <Text style={[styles.text, { color: providerColor }]}>
            {providerName} connected
          </Text>
        </View>
        <TouchableOpacity onPress={onDisconnect} activeOpacity={0.6}>
          <Text style={styles.switchLink}>Switch account</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Button
      title={
        authStatus === "loading"
          ? `Connecting to ${providerName}...`
          : `Connect ${providerName}`
      }
      onPress={onConnect}
      loading={authStatus === "loading"}
      style={{ backgroundColor: providerColor }}
    />
  );
}

const styles = StyleSheet.create({
  connected: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 10,
  },
  connectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    fontSize: 14,
    fontWeight: "500",
  },
  switchLink: {
    fontSize: 12,
    color: COLORS.textSecondary,
    opacity: 0.7,
  },
});
