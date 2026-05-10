import React from "react";
import { View, Text, StyleSheet } from "react-native";
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
        <View style={[styles.dot, { backgroundColor: providerColor }]} />
        <Text style={[styles.text, { color: providerColor }]}>
          {providerName} connected
        </Text>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
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
});
