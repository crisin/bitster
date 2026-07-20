import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { Button } from "@/components/ui/Button";
import { FONT, SPACE } from "@/utils/constants";
import { createThemedStyles } from "@/theme/themedStyles";
import { useStreamingStore } from "@/streaming/store";
import { getProvider } from "@/streaming/registry";

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
  const styles = useStyles();
  const authStatus = useStreamingStore((s) => s.authStatus);
  const activeProviderId = useStreamingStore((s) => s.activeProviderId);
  const account = useStreamingStore((s) => s.account);

  // Show WHICH account is connected — with Duo/Family the wrong login is
  // the most common cause of "I have Premium but it says I don't"
  useEffect(() => {
    if (authStatus !== "authenticated" || account) return;
    const provider = activeProviderId ? getProvider(activeProviderId) : undefined;
    void provider?.diagnostics?.loadAccount();
  }, [authStatus, account, activeProviderId]);

  if (authStatus === "authenticated") {
    return (
      <View style={styles.connected}>
        <View style={styles.connectedRow}>
          <View style={[styles.dot, { backgroundColor: providerColor }]} />
          <Text style={[styles.text, { color: providerColor }]}>
            {account
              ? `${providerName}: ${account.name}${account.product ? ` · ${account.product}` : ""}`
              : `${providerName} connected`}
          </Text>
        </View>
        {account?.email != null && (
          <Text style={styles.accountEmail}>{account.email}</Text>
        )}
        <Pressable
          onPress={onDisconnect}
          label={`Disconnect ${providerName}`}
          style={styles.disconnectBtn}
        >
          <Text style={styles.disconnectLink}>Disconnect</Text>
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

const useStyles = createThemedStyles((COLORS) => StyleSheet.create({
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
  accountEmail: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
  },
  disconnectBtn: {
    minHeight: 36,
    minWidth: 36,
  },
  disconnectLink: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
    opacity: 0.7,
  },
}));
