import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Share,
  Platform,
} from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { COLORS, FONT, RADIUS, SPACE, LABEL_STYLE, TOUCH } from "@/utils/constants";

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
        <Text
          style={styles.code}
          accessibilityRole="text"
          accessibilityLabel={`Room code: ${code.split("").join(" ")}`}
          selectable
        >
          {code}
        </Text>
        <Pressable
          onPress={handleCopy}
          label="Copy room code"
          style={styles.actionBtn}
        >
          <Text style={styles.actionIcon}>📋</Text>
        </Pressable>
        {Platform.OS !== "web" && (
          <Pressable
            onPress={handleShare}
            label="Share room code"
            style={styles.actionBtn}
          >
            <Text style={styles.actionIcon}>📤</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: SPACE.sm,
  },
  label: {
    ...LABEL_STYLE,
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
  },
  code: {
    fontSize: FONT.size["5xl"],
    fontWeight: FONT.weight.extrabold,
    color: COLORS.textPrimary,
    letterSpacing: 6,
    fontVariant: ["tabular-nums"],
    backgroundColor: COLORS.secondary,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.xl,
    borderRadius: RADIUS.md,
    overflow: "hidden",
  },
  actionBtn: {
    width: TOUCH.minWidth,
    height: TOUCH.minHeight,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionIcon: {
    fontSize: FONT.size.xl,
  },
});
