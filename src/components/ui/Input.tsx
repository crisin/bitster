import React from "react";
import {
  TextInput,
  StyleSheet,
  View,
  Text,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { COLORS, SIZES } from "@/utils/constants";

interface InputProps extends Omit<TextInputProps, "style"> {
  error?: string;
  style?: ViewStyle;
}

export function Input({ error, style, ...props }: InputProps) {
  return (
    <View style={[styles.container, style]}>
      <TextInput
        placeholderTextColor={COLORS.textSecondary}
        style={[styles.input, error && styles.inputError]}
        {...props}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  input: {
    width: "100%",
    height: SIZES.buttonHeight,
    paddingHorizontal: 16,
    borderRadius: SIZES.borderRadius,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
    color: COLORS.textPrimary,
    fontSize: SIZES.fontBody,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  errorText: {
    color: COLORS.error,
    fontSize: SIZES.fontSmall,
    marginTop: 4,
  },
});
