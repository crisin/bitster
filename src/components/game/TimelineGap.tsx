import React from "react";
import { Text, StyleSheet } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { COLORS, RADIUS, FONT, LAYOUT } from "@/utils/constants";

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
    <Pressable
      onPress={onPress}
      disabled={disabled}
      label={label ?? "Place song here"}
      style={[
        styles.gap,
        selected && styles.selected,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.icon, selected && styles.iconSelected]}>
        {label ?? "+"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gap: {
    width: "100%",
    maxWidth: LAYOUT.cardMaxWidth,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: COLORS.textSecondary,
    opacity: 0.3,
  },
  selected: {
    opacity: 1,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentLight,
  },
  disabled: {
    opacity: 0.15,
  },
  icon: {
    fontSize: FONT.size.lg,
    color: COLORS.textSecondary,
    fontWeight: FONT.weight.semibold,
  },
  iconSelected: {
    fontSize: FONT.size.xl,
    color: COLORS.accent,
  },
});
