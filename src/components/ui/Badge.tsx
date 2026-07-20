import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { FONT, RADIUS, SPACE } from "@/utils/constants";
import { createThemedStyles, useThemeColors } from "@/theme/themedStyles";
import type { ThemeColors } from "@/theme/themes";

type BadgeVariant = "default" | "success" | "warning" | "error";

function variantColors(
  COLORS: ThemeColors,
): Record<BadgeVariant, { bg: string; text: string }> {
  return {
    default: { bg: COLORS.accent, text: COLORS.white },
    success: { bg: COLORS.success, text: COLORS.white },
    warning: { bg: COLORS.warning, text: COLORS.white },
    error: { bg: COLORS.error, text: COLORS.white },
  };
}

interface BadgeProps {
  label: string;
  /** Semantic variant (overrides custom color) */
  variant?: BadgeVariant;
  /** Custom background color */
  color?: string;
}

export function Badge({ label, variant = "default", color }: BadgeProps) {
  const styles = useStyles();
  const colors = variantColors(useThemeColors())[variant];
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

const useStyles = createThemedStyles(() =>
  StyleSheet.create({
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
  }),
);
