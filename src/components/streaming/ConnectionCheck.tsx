import { Button } from "@/components/ui/Button";
import { Pressable } from "@/components/ui/Pressable";
import { getProvider } from "@/streaming/registry";
import { useStreamingStore } from "@/streaming/store";
import type { DiagnosticCheck } from "@/streaming/types";
import { createThemedStyles, useThemeColors } from "@/theme/themedStyles";
import type { ThemeColors } from "@/theme/themes";
import { FONT, RADIUS, SPACE } from "@/utils/constants";
import { log } from "@/utils/logger";
import * as Clipboard from "expo-clipboard";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

const STATUS_ICON: Record<DiagnosticCheck["status"], string> = {
  ok: "✓",
  warn: "⚠",
  fail: "✗",
};

function statusColors(
  COLORS: ThemeColors,
): Record<DiagnosticCheck["status"], string> {
  return {
    ok: COLORS.success,
    warn: COLORS.warning,
    fail: COLORS.error,
  };
}

/**
 * Collapsible "is my Spotify actually working?" panel: which account is
 * connected, does it have Premium, is it allow-listed, are devices visible.
 * Includes a copyable report (for sending to the host) and a full reconnect.
 */
export function ConnectionCheck() {
  const styles = useStyles();
  const COLORS = useThemeColors();
  const STATUS_COLOR = statusColors(COLORS);
  const activeProviderId = useStreamingStore((s) => s.activeProviderId);
  const authStatus = useStreamingStore((s) => s.authStatus);
  const account = useStreamingStore((s) => s.account);

  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState<DiagnosticCheck[] | null>(null);
  const [copied, setCopied] = useState(false);

  const provider = activeProviderId ? getProvider(activeProviderId) : undefined;
  const diagnostics = provider?.diagnostics;

  // Load the account profile as soon as the panel is opened
  useEffect(() => {
    if (expanded && !account && diagnostics) {
      void diagnostics.loadAccount();
    }
  }, [expanded, account, diagnostics]);

  const handleRun = useCallback(async () => {
    if (!diagnostics) return;
    setRunning(true);
    setChecks(null);
    setCopied(false);
    const results = await diagnostics.run();
    setChecks(results);
    setRunning(false);
  }, [diagnostics]);

  const handleCopy = useCallback(async () => {
    if (!checks) return;
    const lines = [
      `bitster Spotify check (${new Date().toISOString()})`,
      ...checks.map((c) => `${STATUS_ICON[c.status]} ${c.label}: ${c.detail}`),
    ];
    await Clipboard.setStringAsync(lines.join("\n"));
    setCopied(true);
  }, [checks]);

  const handleReconnect = useCallback(async () => {
    if (!provider || !activeProviderId) return;
    setChecks(null);
    // Full reset: wipe stored tokens, then a fresh login with current scopes
    await provider.auth.logout();
    useStreamingStore.getState().setAccount(null);
    useStreamingStore.getState().setActiveProvider(activeProviderId);
    try {
      await provider.auth.login();
    } catch (err) {
      log.error("spotify", `Reconnect failed: ${err}`);
    }
  }, [provider, activeProviderId]);

  if (!diagnostics || authStatus !== "authenticated") return null;

  if (!expanded) {
    return (
      <Pressable
        onPress={() => setExpanded(true)}
        label="Open Spotify connection check"
        style={styles.toggle}
      >
        <Text style={styles.toggleText}>
          Spotify not working? Run a check ▸
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Spotify check</Text>
        <Pressable
          onPress={() => setExpanded(false)}
          label="Close connection check"
          style={styles.closeBtn}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      {account && (
        <Text style={styles.accountLine}>
          Connected as{" "}
          <Text style={styles.accountName}>
            {account.name}
            {account.email ? ` (${account.email})` : ""}
          </Text>
          {account.product ? ` — ${account.product}` : ""}
        </Text>
      )}

      {running && (
        <View style={styles.runningRow}>
          <ActivityIndicator size="small" color={COLORS.textSecondary} />
          <Text style={styles.runningText}>Checking…</Text>
        </View>
      )}

      {checks?.map((c) => (
        <View key={c.key} style={styles.checkRow}>
          <Text style={[styles.checkIcon, { color: STATUS_COLOR[c.status] }]}>
            {STATUS_ICON[c.status]}
          </Text>
          <View style={styles.checkBody}>
            <Text
              style={[styles.checkLabel, { color: STATUS_COLOR[c.status] }]}
            >
              {c.label}
            </Text>
            <Text style={styles.checkDetail}>{c.detail}</Text>
          </View>
        </View>
      ))}

      <View style={styles.buttonRow}>
        <Button
          title={checks ? "Check again" : "Run check"}
          onPress={handleRun}
          variant="secondary"
          compact
          disabled={running}
          cooldownMs={1000}
          label="Run the Spotify connection check"
          style={styles.flex1}
        />
        {checks != null && (
          <Button
            title={copied ? "Copied ✓" : "Copy report"}
            onPress={handleCopy}
            variant="ghost"
            compact
            label="Copy the check report to the clipboard"
            style={styles.flex1}
          />
        )}
      </View>

      <Button
        title="Reconnect Spotify (reset login)"
        onPress={handleReconnect}
        variant="warning"
        compact
        cooldownMs={2000}
        label="Wipe the stored Spotify login and sign in again"
      />
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) =>
  StyleSheet.create({
    toggle: {
      minHeight: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    toggleText: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
      opacity: 0.8,
    },
    panel: {
      width: "100%",
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgCard,
      padding: SPACE.lg,
      gap: SPACE.md,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    title: {
      fontSize: FONT.size.base,
      fontWeight: FONT.weight.bold,
      color: COLORS.textPrimary,
      textTransform: "uppercase",
      letterSpacing: FONT.tracking.wider,
    },
    closeBtn: {
      minHeight: 36,
      minWidth: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    closeText: {
      fontSize: FONT.size.lg,
      color: COLORS.textSecondary,
    },
    accountLine: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
    },
    accountName: {
      color: COLORS.textPrimary,
      fontWeight: FONT.weight.semibold,
    },
    runningRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.sm,
    },
    runningText: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
    },
    checkRow: {
      flexDirection: "row",
      gap: SPACE.sm,
      alignItems: "flex-start",
    },
    checkIcon: {
      fontSize: FONT.size.base,
      fontWeight: FONT.weight.bold,
      width: 18,
      textAlign: "center",
    },
    checkBody: {
      flex: 1,
      gap: 1,
    },
    checkLabel: {
      fontSize: FONT.size.sm,
      fontWeight: FONT.weight.semibold,
    },
    checkDetail: {
      fontSize: FONT.size.sm,
      color: COLORS.textPrimary,
      opacity: 0.85,
      lineHeight: 18,
    },
    buttonRow: {
      flexDirection: "row",
      gap: SPACE.sm,
    },
    flex1: {
      flex: 1,
    },
  }),
);
