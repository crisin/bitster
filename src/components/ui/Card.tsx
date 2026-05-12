import React from "react";
import { View, StyleSheet, type ViewStyle } from "react-native";
import { COLORS, RADIUS, SPACE } from "@/utils/constants";

interface CardProps {
  children: React.ReactNode;
  /** Override border color (e.g. for accent-highlighted cards) */
  borderColor?: string;
  /** Extra padding override */
  padding?: number;
  /** Additional styles */
  style?: ViewStyle;
  /** Whether this card is visually elevated (lighter bg) */
  elevated?: boolean;
}

/**
 * Reusable card container with consistent background, border, and radius.
 * Replaces the repeated View + bgCard + border + borderRadius pattern.
 */
export function Card({
  children,
  borderColor,
  padding,
  style,
  elevated = false,
}: CardProps) {
  return (
    <View
      style={[
        styles.card,
        elevated && styles.elevated,
        borderColor != null && { borderColor },
        padding != null && { padding },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACE.lg,
    width: "100%",
  },
  elevated: {
    backgroundColor: COLORS.bgElevated,
  },
});
