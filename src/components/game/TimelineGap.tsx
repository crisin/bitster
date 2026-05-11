import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { COLORS, SIZES } from "@/utils/constants";

interface TimelineGapProps {
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  label?: string;
}

export function TimelineGap({
  onPress,
  selected = false,
  disabled = false,
  label,
}: TimelineGapProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.6}
      style={[
        styles.gap,
        selected && styles.selected,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.icon, selected && styles.iconSelected]}>
        {label ?? "+"}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  gap: {
    width: "100%",
    maxWidth: 360,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: SIZES.borderRadius,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: COLORS.textSecondary,
    opacity: 0.3,
  },
  selected: {
    opacity: 1,
    borderColor: COLORS.accent,
    backgroundColor: "rgba(201, 72, 91, 0.12)",
  },
  disabled: {
    opacity: 0.15,
  },
  icon: {
    fontSize: 16,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  iconSelected: {
    fontSize: 20,
    color: COLORS.accent,
  },
});
