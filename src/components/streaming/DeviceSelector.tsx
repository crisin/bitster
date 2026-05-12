import React, { useState, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { useStreamingStore } from "@/streaming/store";
import { getProvider } from "@/streaming/registry";
import { COLORS, FONT, RADIUS, SPACE, LABEL_STYLE, TOUCH } from "@/utils/constants";

export function DeviceSelector() {
  const activeProviderId = useStreamingStore((s) => s.activeProviderId);
  const authStatus = useStreamingStore((s) => s.authStatus);
  const activeDevice = useStreamingStore((s) => s.activeDevice);
  const availableDevices = useStreamingStore((s) => s.availableDevices);
  const [loading, setLoading] = useState(false);

  const refreshDevices = useCallback(async () => {
    if (!activeProviderId) return;
    const provider = getProvider(activeProviderId);
    if (!provider) return;

    setLoading(true);
    try {
      await provider.player.getDevices();
    } catch {
      // ignore
    }
    setLoading(false);
  }, [activeProviderId]);

  useEffect(() => {
    if (authStatus === "authenticated") {
      refreshDevices();
    }
  }, [authStatus, refreshDevices]);

  const handleSelectDevice = useCallback(
    async (deviceId: string) => {
      if (!activeProviderId) return;
      const provider = getProvider(activeProviderId);
      if (!provider) return;

      try {
        await provider.player.setDevice(deviceId);
      } catch {
        // ignore
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

      {availableDevices.length === 0 && !loading && (
        <Text style={styles.hint}>
          No devices found. Open Spotify on your device.
        </Text>
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
  hint: {
    color: COLORS.textSecondary,
    fontSize: FONT.size.base,
    paddingVertical: SPACE.sm,
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
