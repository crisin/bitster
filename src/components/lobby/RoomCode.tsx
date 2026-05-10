import React, { useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Share,
  Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { COLORS, SIZES } from "@/utils/constants";

interface RoomCodeProps {
  code: string;
}

export function RoomCode({ code }: RoomCodeProps) {
  const handleCopy = useCallback(async () => {
    if (Platform.OS === "web") {
      await navigator.clipboard.writeText(code);
    }
  }, [code]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: `Play Hitster with me! Room code: ${code}`,
      });
    } catch {
      // user cancelled share
    }
  }, [code]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Room Code</Text>
      <View style={styles.codeRow}>
        <Text style={styles.code}>{code}</Text>
        <TouchableOpacity
          onPress={handleCopy}
          style={styles.actionBtn}
          activeOpacity={0.6}
        >
          <Text style={styles.actionIcon}>📋</Text>
        </TouchableOpacity>
        {Platform.OS !== "web" && (
          <TouchableOpacity
            onPress={handleShare}
            style={styles.actionBtn}
            activeOpacity={0.6}
          >
            <Text style={styles.actionIcon}>📤</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 8,
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "600",
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  code: {
    fontSize: 32,
    fontWeight: "800",
    color: COLORS.textPrimary,
    letterSpacing: 6,
    fontVariant: ["tabular-nums"],
    backgroundColor: COLORS.secondary,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: SIZES.borderRadius,
    overflow: "hidden",
  },
  actionBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: SIZES.borderRadius,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionIcon: {
    fontSize: 18,
  },
});
