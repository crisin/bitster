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
    width: SIZES.gapTouchWidth,
    height: SIZES.gapTouchHeight,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: SIZES.borderRadius,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: COLORS.accent,
    opacity: 0.4,
  },
  selected: {
    opacity: 1,
    backgroundColor: "rgba(233, 69, 96, 0.15)",
  },
  disabled: {
    opacity: 0.15,
  },
  icon: {
    fontSize: 22,
    color: COLORS.accent,
    fontWeight: "600",
  },
  iconSelected: {
    fontSize: 26,
  },
});
