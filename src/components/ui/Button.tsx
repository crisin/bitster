import React from "react";
import {
  Text,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
} from "react-native";
import { Pressable } from "./Pressable";
import { COLORS, FONT, RADIUS, SPACE, LAYOUT } from "@/utils/constants";

type Variant = "primary" | "secondary" | "ghost" | "spotify" | "warning";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  /** Compact height (40px instead of 52px) */
  compact?: boolean;
  /** Accessible label override (defaults to title) */
  label?: string;
  style?: ViewStyle;
}

const variantStyles: Record<Variant, { bg: string; text: string; border?: string }> = {
  primary: { bg: COLORS.accent, text: COLORS.white },
  secondary: { bg: COLORS.secondary, text: COLORS.white },
  ghost: { bg: COLORS.transparent, text: COLORS.textSecondary, border: COLORS.border },
  spotify: { bg: COLORS.spotify, text: COLORS.white },
  warning: { bg: COLORS.warningLight, text: COLORS.warning, border: COLORS.warning },
};

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  compact = false,
  label,
  style,
}: ButtonProps) {
  const colors = variantStyles[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      label={label ?? title}
      style={[
        styles.button,
        compact && styles.compact,
        { backgroundColor: colors.bg },
        colors.border != null && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} size="small" />
      ) : (
        <Text style={[styles.text, { color: colors.text }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: LAYOUT.buttonHeight,
    minHeight: LAYOUT.buttonHeight,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACE["2xl"],
  },
  compact: {
    height: 40,
    minHeight: 40,
    paddingHorizontal: SPACE.lg,
  },
  text: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.semibold,
  },
});
