import React, { useState, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { Button } from "@/components/ui/Button";
import { useStreamingStore } from "@/streaming/store";
import { getProvider } from "@/streaming/registry";
import { log } from "@/utils/logger";
import { COLORS, FONT, RADIUS, SPACE, LABEL_STYLE, TOUCH } from "@/utils/constants";

export function DeviceSelector() {
  const activeProviderId = useStreamingStore((s) => s.activeProviderId);
  const authStatus = useStreamingStore((s) => s.authStatus);
  const activeDevice = useStreamingStore((s) => s.activeDevice);
  const availableDevices = useStreamingStore((s) => s.availableDevices);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [is403, setIs403] = useState(false);

  const refreshDevices = useCallback(async () => {
    if (!activeProviderId) return;
    const provider = getProvider(activeProviderId);
    if (!provider) return;

    setLoading(true);
    setError(null);
    setIs403(false);
    try {
      await provider.player.getDevices();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("DeviceSelector", `Failed to load devices: ${msg}`);

      if (msg.startsWith("SPOTIFY_403")) {
        setIs403(true);
        setError(null);
      } else {
        setError(msg);
      }
    }
    setLoading(false);
  }, [activeProviderId]);

  useEffect(() => {
    if (authStatus === "authenticated") {
      refreshDevices();
    }
  }, [authStatus, refreshDevices]);

  const handleReconnect = useCallback(async () => {
    if (!activeProviderId) return;
    const provider = getProvider(activeProviderId);
    if (!provider) return;

    // Logout clears old tokens, then login gets fresh ones with current scopes
    await provider.auth.logout();
    useStreamingStore.getState().setActiveProvider(activeProviderId);
    provider.auth.login();
  }, [activeProviderId]);

  const handleSelectDevice = useCallback(
    async (deviceId: string) => {
      if (!activeProviderId) return;
      const provider = getProvider(activeProviderId);
      if (!provider) return;

      try {
        await provider.player.setDevice(deviceId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error("DeviceSelector", `Failed to set device: ${msg}`);
      }
    },
    [activeProviderId],
  );

  if (authStatus !== "authenticated") return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Playback Device</Text>
        <Pressable
          onPress={refreshDevices}
          disabled={loading}
          label="Refresh device list"
          style={styles.refreshBtn}
        >
          {loading ? (
            <ActivityIndicator size="small" color={COLORS.textSecondary} />
          ) : (
            <Text style={styles.refreshIcon}>↻</Text>
          )}
        </Pressable>
      </View>

      {/* 403 Forbidden — Premium required or stale scopes */}
      {is403 && (
        <View style={styles.forbiddenBox}>
          <Text style={styles.forbiddenTitle}>
            ⚠ Spotify Premium required
          </Text>
          <Text style={styles.forbiddenDetail}>
            Playback control needs Spotify Premium. If you already have Premium,
            your login token may have outdated permissions — reconnect to fix this.
          </Text>
          <Button
            title="Reconnect Spotify"
            onPress={handleReconnect}
            variant="warning"
            compact
            label="Clear old tokens and reconnect Spotify"
          />
        </View>
      )}

      {/* Generic error */}
      {error != null && !is403 && (
        <Text style={styles.errorText}>
          Failed to load devices: {error}
        </Text>
      )}

      {/* No devices hint */}
      {availableDevices.length === 0 && !loading && !is403 && error == null && (
        <View style={styles.hintBox}>
          <Text style={styles.hint}>No devices found.</Text>
          <Text style={styles.hintDetail}>
            Open Spotify and play a song briefly, then tap ↻ to refresh.
            Make sure the same Spotify account is used in both apps.
          </Text>
        </View>
      )}

      {availableDevices.map((device) => {
        const isActive = activeDevice?.id === device.id;
        return (
          <Pressable
            key={device.id}
            style={[styles.deviceRow, isActive && styles.deviceActive]}
            onPress={() => handleSelectDevice(device.id)}
            label={`Select ${device.name} as playback device${isActive ? " (active)" : ""}`}
          >
            <Text style={styles.deviceIcon}>
              {device.type === "Smartphone"
                ? "📱"
                : device.type === "Computer"
                  ? "💻"
                  : "🔊"}
            </Text>
            <Text
              style={[
                styles.deviceName,
                isActive && styles.deviceNameActive,
              ]}
            >
              {device.name}
            </Text>
            {isActive && <Text style={styles.activeLabel}>Active</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    gap: SPACE.sm,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    ...LABEL_STYLE,
  },
  refreshBtn: {
    minHeight: TOUCH.minHeight,
    minWidth: TOUCH.minWidth,
  },
  refreshIcon: {
    fontSize: FONT.size.xl,
    color: COLORS.textSecondary,
  },
  forbiddenBox: {
    backgroundColor: COLORS.warningLight,
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: RADIUS.md,
    padding: SPACE.lg,
    gap: SPACE.sm,
  },
  forbiddenTitle: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.bold,
    color: COLORS.warning,
  },
  forbiddenDetail: {
    fontSize: FONT.size.sm,
    color: COLORS.textPrimary,
    lineHeight: 18,
    opacity: 0.85,
  },
  errorText: {
    color: COLORS.error,
    fontSize: FONT.size.sm,
    paddingVertical: SPACE.xs,
  },
  hintBox: {
    gap: SPACE.xs,
    paddingVertical: SPACE.sm,
  },
  hint: {
    color: COLORS.textSecondary,
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.medium,
  },
  hintDetail: {
    color: COLORS.textSecondary,
    fontSize: FONT.size.sm,
    opacity: 0.7,
    lineHeight: 18,
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: SPACE["5xl"],
  },
  deviceActive: {
    borderColor: COLORS.spotify,
  },
  deviceIcon: {
    fontSize: FONT.size.lg,
  },
  deviceName: {
    flex: 1,
    fontSize: FONT.size.base,
    color: COLORS.textPrimary,
  },
  deviceNameActive: {
    fontWeight: FONT.weight.semibold,
  },
  activeLabel: {
    fontSize: FONT.size.xs,
    color: COLORS.spotify,
    fontWeight: FONT.weight.semibold,
    textTransform: "uppercase",
  },
});
