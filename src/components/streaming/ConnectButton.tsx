import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { Button } from "@/components/ui/Button";
import { COLORS, FONT, SPACE } from "@/utils/constants";
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
        <Pressable
          onPress={onDisconnect}
          label={`Switch ${providerName} account`}
          style={styles.switchBtn}
        >
          <Text style={styles.switchLink}>Switch account</Text>
        </Pressable>
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
      label={`Connect to ${providerName}`}
      style={{ backgroundColor: providerColor }}
    />
  );
}

const styles = StyleSheet.create({
  connected: {
    alignItems: "center",
    gap: SPACE.xs,
    paddingVertical: SPACE.md,
  },
  connectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.medium,
  },
  switchBtn: {
    minHeight: 36,
    minWidth: 36,
  },
  switchLink: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
    opacity: 0.7,
  },
});
