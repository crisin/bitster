import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { COLORS, SIZES } from "@/utils/constants";

type Variant = "primary" | "secondary" | "ghost" | "spotify";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

const variantStyles: Record<Variant, { bg: string; text: string }> = {
  primary: { bg: COLORS.accent, text: "#ffffff" },
  secondary: { bg: COLORS.secondary, text: "#ffffff" },
  ghost: { bg: "transparent", text: COLORS.textSecondary },
  spotify: { bg: COLORS.spotify, text: "#ffffff" },
};

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  style,
}: ButtonProps) {
  const colors = variantStyles[variant];
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      style={[
        styles.button,
        { backgroundColor: colors.bg },
        variant === "ghost" && styles.ghost,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} size="small" />
      ) : (
        <Text style={[styles.text, { color: colors.text }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    height: SIZES.buttonHeight,
    borderRadius: SIZES.borderRadius,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  ghost: {
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  disabled: {
    opacity: 0.4,
  },
  text: {
    fontSize: SIZES.fontBody,
    fontWeight: "600",
  },
});
