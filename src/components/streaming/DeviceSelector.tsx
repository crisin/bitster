import React, { useState, useCallback, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useStreamingStore } from "@/streaming/store";
import { getProvider } from "@/streaming/registry";
import { COLORS, SIZES } from "@/utils/constants";

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
        <TouchableOpacity onPress={refreshDevices} disabled={loading}>
          {loading ? (
            <ActivityIndicator size="small" color={COLORS.textSecondary} />
          ) : (
            <Text style={styles.refreshBtn}>↻</Text>
          )}
        </TouchableOpacity>
      </View>

      {availableDevices.length === 0 && !loading && (
        <Text style={styles.hint}>No devices found. Open Spotify on your device.</Text>
      )}

      {availableDevices.map((device) => (
        <TouchableOpacity
          key={device.id}
          style={[
            styles.deviceRow,
            activeDevice?.id === device.id && styles.deviceActive,
          ]}
          onPress={() => handleSelectDevice(device.id)}
          activeOpacity={0.6}
        >
          <Text style={styles.deviceIcon}>
            {device.type === "Smartphone" ? "📱" : device.type === "Computer" ? "💻" : "🔊"}
          </Text>
          <Text
            style={[
              styles.deviceName,
              activeDevice?.id === device.id && styles.deviceNameActive,
            ]}
          >
            {device.name}
          </Text>
          {activeDevice?.id === device.id && (
            <Text style={styles.activeLabel}>Active</Text>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: 12,
    textTransform: "uppercase",
    color: COLORS.textSecondary,
    fontWeight: "600",
    letterSpacing: 1,
  },
  refreshBtn: {
    fontSize: 18,
    color: COLORS.textSecondary,
  },
  hint: {
    color: COLORS.textSecondary,
    fontSize: 13,
    paddingVertical: 8,
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: SIZES.borderRadius,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  deviceActive: {
    borderColor: COLORS.spotify,
  },
  deviceIcon: {
    fontSize: 16,
  },
  deviceName: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  deviceNameActive: {
    fontWeight: "600",
  },
  activeLabel: {
    fontSize: 11,
    color: COLORS.spotify,
    fontWeight: "600",
    textTransform: "uppercase",
  },
});
