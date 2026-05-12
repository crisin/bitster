import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { COLORS, FONT, RADIUS, SPACE } from "@/utils/constants";

type BadgeVariant = "default" | "success" | "warning" | "error";

const VARIANT_COLORS: Record<BadgeVariant, { bg: string; text: string }> = {
  default: { bg: COLORS.accent, text: COLORS.white },
  success: { bg: COLORS.success, text: COLORS.white },
  warning: { bg: COLORS.warning, text: COLORS.white },
  error: { bg: COLORS.error, text: COLORS.white },
};

interface BadgeProps {
  label: string;
  /** Semantic variant (overrides custom color) */
  variant?: BadgeVariant;
  /** Custom background color */
  color?: string;
}

export function Badge({ label, variant = "default", color }: BadgeProps) {
  const colors = VARIANT_COLORS[variant];
  const bg = color ?? colors.bg;

  return (
    <View
      style={[styles.badge, { backgroundColor: bg }]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: SPACE.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.xs,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: FONT.size.xs,
    fontWeight: FONT.weight.bold,
    letterSpacing: FONT.tracking.wide,
  },
});
