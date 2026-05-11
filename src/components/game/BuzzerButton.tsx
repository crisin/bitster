import React from "react";
import { TouchableOpacity, Text, StyleSheet, View } from "react-native";
import { COLORS, SIZES } from "@/utils/constants";

interface BuzzerButtonProps {
  onPress: () => void;
  disabled: boolean;
  buzzerName?: string | null;
}

export function BuzzerButton({ onPress, disabled, buzzerName }: BuzzerButtonProps) {
  if (buzzerName) {
    return (
      <View style={styles.claimedContainer}>
        <Text style={styles.claimedText}>
          {buzzerName} buzzed!
        </Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text style={styles.label}>HITSTER! (1★)</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: SIZES.borderRadius,
    borderWidth: 1.5,
    borderColor: COLORS.warning,
    backgroundColor: "rgba(201, 144, 58, 0.1)",
    alignItems: "center",
  },
  disabled: {
    opacity: 0.3,
  },
  label: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.warning,
    letterSpacing: 2,
  },
  claimedContainer: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: SIZES.borderRadius,
    borderWidth: 1.5,
    borderColor: COLORS.warning,
    backgroundColor: "rgba(201, 144, 58, 0.15)",
    alignItems: "center",
  },
  claimedText: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.warning,
  },
});
