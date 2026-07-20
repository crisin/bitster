import React, { useCallback, useState, forwardRef } from "react";
import {
  TextInput,
  StyleSheet,
  View,
  Text,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { FONT, RADIUS, SPACE, LAYOUT } from "@/utils/constants";
import { createThemedStyles, useThemeColors } from "@/theme/themedStyles";

interface InputProps extends Omit<TextInputProps, "style"> {
  /** Validation error message */
  error?: string;
  /** Accessible label (defaults to placeholder) */
  label?: string;
  /** Container style override */
  style?: ViewStyle;
}

export const Input = forwardRef<TextInput, InputProps>(
  ({ error, label, style, placeholder, ...props }, ref) => {
    const styles = useStyles();
    const COLORS = useThemeColors();
    const [focused, setFocused] = useState(false);

    const handleFocus = useCallback(
      (e: Parameters<NonNullable<TextInputProps["onFocus"]>>[0]) => {
        setFocused(true);
        props.onFocus?.(e);
      },
      [props.onFocus],
    );

    const handleBlur = useCallback(
      (e: Parameters<NonNullable<TextInputProps["onBlur"]>>[0]) => {
        setFocused(false);
        props.onBlur?.(e);
      },
      [props.onBlur],
    );

    return (
      <View style={[styles.container, style]}>
        <TextInput
          ref={ref}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textSecondary}
          accessibilityLabel={label ?? placeholder}
          style={[
            styles.input,
            focused && styles.inputFocused,
            error != null && styles.inputError,
          ]}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...props}
        />
        {error != null && <Text style={styles.errorText}>{error}</Text>}
      </View>
    );
  },
);

Input.displayName = "Input";

const useStyles = createThemedStyles((COLORS) =>
  StyleSheet.create({
    container: {
      width: "100%",
    },
    input: {
      width: "100%",
      height: LAYOUT.inputHeight,
      minHeight: LAYOUT.inputHeight,
      paddingHorizontal: SPACE.lg,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgCard,
      color: COLORS.textPrimary,
      fontSize: FONT.size.lg,
    },
    inputFocused: {
      borderColor: COLORS.borderFocused,
      outlineWidth: 2,
      outlineColor: COLORS.accent,
      outlineStyle: "solid",
      outlineOffset: 1,
    } as ViewStyle,
    inputError: {
      borderColor: COLORS.error,
    },
    errorText: {
      color: COLORS.error,
      fontSize: FONT.size.sm,
      marginTop: SPACE.xs,
    },
  }),
);
