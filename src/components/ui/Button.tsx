import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Text,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
} from "react-native";
import { Pressable } from "./Pressable";
import { createThemedStyles, useTheme } from "@/theme/themedStyles";
import type { ThemeColors } from "@/theme/themes";
import { FONT, RADIUS, SPACE, LAYOUT } from "@/utils/constants";

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
  /** Ignore further presses for this long after a press (accidental double-taps) */
  cooldownMs?: number;
  style?: ViewStyle;
}

function variantColors(
  COLORS: ThemeColors,
): Record<Variant, { bg: string; text: string; border?: string }> {
  return {
    primary: { bg: COLORS.accent, text: COLORS.white },
    secondary: { bg: COLORS.secondary, text: COLORS.white },
    ghost: { bg: COLORS.transparent, text: COLORS.textSecondary, border: COLORS.border },
    spotify: { bg: COLORS.spotify, text: COLORS.white },
    warning: { bg: COLORS.warningLight, text: COLORS.warning, border: COLORS.warning },
  };
}

/** Variants that get a neon glow when the theme asks for it */
const GLOW_VARIANTS: Variant[] = ["primary", "warning", "spotify"];

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  compact = false,
  label,
  cooldownMs = 0,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const styles = useStyles();
  const colors = variantColors(theme.colors)[variant];
  const [coolingDown, setCoolingDown] = useState(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    };
  }, []);

  const handlePress = useCallback(() => {
    if (cooldownMs > 0) {
      setCoolingDown(true);
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
      cooldownTimer.current = setTimeout(() => setCoolingDown(false), cooldownMs);
    }
    onPress();
  }, [onPress, cooldownMs]);

  const isDisabled = disabled || loading || coolingDown;
  const glow =
    theme.effects.glow && !isDisabled && GLOW_VARIANTS.includes(variant)
      ? { shadowColor: colors.border ?? colors.bg, shadowOpacity: 0.7, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 8 }
      : null;

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      label={label ?? title}
      style={[
        styles.button,
        compact && styles.compact,
        { backgroundColor: colors.bg },
        colors.border != null && { borderWidth: 1, borderColor: colors.border },
        glow,
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

const useStyles = createThemedStyles(() =>
  StyleSheet.create({
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
  }),
);
