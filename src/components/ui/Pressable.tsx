import React, { useCallback, useState } from "react";
import {
  Pressable as RNPressable,
  StyleSheet,
  type ViewStyle,
  type PressableProps as RNPressableProps,
} from "react-native";
import { COLORS, TOUCH } from "@/utils/constants";

/** Style value that accepts conditional expressions: `[styles.a, condition && styles.b]` */
type FlexibleStyle = ViewStyle | false | null | undefined;

export interface PressableProps extends Omit<RNPressableProps, "style" | "role"> {
  /** Visual style — supports conditional arrays like `[styles.a, active && styles.b]` */
  style?: ViewStyle | FlexibleStyle[];
  /** Accessible name read by screen readers */
  label?: string;
  /** Show a visible focus ring on keyboard focus */
  focusRing?: boolean;
  /** Disable the component */
  disabled?: boolean;
  /** Override pressed opacity (default 0.7) */
  activeOpacity?: number;
  children: React.ReactNode;
}

/**
 * Universal interactive container.
 * Provides keyboard focus ring, accessible role/label, and consistent touch feedback.
 * Use this as the base for all custom interactive components.
 */
export function Pressable({
  style,
  label,
  focusRing = true,
  disabled = false,
  activeOpacity = TOUCH.activeOpacity,
  children,
  ...rest
}: PressableProps) {
  const [focused, setFocused] = useState(false);

  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);

  // Filter out falsy values from style arrays
  const baseStyles: ViewStyle[] = Array.isArray(style)
    ? (style.filter(Boolean) as ViewStyle[])
    : style
      ? [style]
      : [];

  return (
    <RNPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={({ pressed }) => [
        styles.base,
        ...baseStyles,
        pressed && { opacity: activeOpacity },
        disabled && styles.disabled,
        focusRing && focused && styles.focusRing,
      ]}
      {...rest}
    >
      {children}
    </RNPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TOUCH.minHeight,
    minWidth: TOUCH.minWidth,
    justifyContent: "center",
    alignItems: "center",
  },
  disabled: {
    opacity: 0.4,
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: COLORS.accent,
    outlineStyle: "solid",
    outlineOffset: 2,
  } as ViewStyle,
});
