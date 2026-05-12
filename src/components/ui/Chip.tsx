import React from "react";
import { Text, StyleSheet } from "react-native";
import { Pressable } from "./Pressable";
import { COLORS, RADIUS, SPACE, FONT } from "@/utils/constants";

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
  /** Accent color when selected. Defaults to COLORS.accent */
  activeColor?: string;
}

/**
 * Compact toggle chip. Used for settings selectors, filter options, etc.
 */
export function Chip({
  label,
  selected = false,
  onPress,
  disabled = false,
  activeColor = COLORS.accent,
}: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      label={label}
      style={[
        styles.chip,
        selected && { backgroundColor: activeColor, borderColor: activeColor },
      ]}
    >
      <Text style={[styles.text, selected && styles.textActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 40,
    minWidth: 40,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  text: {
    fontSize: FONT.size.base,
    color: COLORS.textSecondary,
  },
  textActive: {
    color: COLORS.textPrimary,
    fontWeight: FONT.weight.semibold,
  },
});
