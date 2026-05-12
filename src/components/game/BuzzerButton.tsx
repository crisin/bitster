import React from "react";
import { Text, View, StyleSheet } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { COLORS, RADIUS, SPACE, FONT } from "@/utils/constants";

interface BuzzerButtonProps {
  onPress: () => void;
  disabled: boolean;
  buzzerName?: string | null;
}

export function BuzzerButton({ onPress, disabled, buzzerName }: BuzzerButtonProps) {
  if (buzzerName) {
    return (
      <View
        style={styles.claimedContainer}
        accessibilityRole="text"
        accessibilityLabel={`${buzzerName} buzzed`}
      >
        <Text style={styles.claimedText}>
          {buzzerName} buzzed!
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      label="Hitster buzz — costs 1 star"
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text style={styles.label}>HITSTER! (1★)</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.xl,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.warning,
    backgroundColor: COLORS.warningLight,
    alignItems: "center",
  },
  disabled: {
    opacity: 0.3,
  },
  label: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.extrabold,
    color: COLORS.warning,
    letterSpacing: FONT.tracking.widest,
  },
  claimedContainer: {
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.xl,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.warning,
    backgroundColor: COLORS.warningLight,
    alignItems: "center",
  },
  claimedText: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.bold,
    color: COLORS.warning,
  },
});
