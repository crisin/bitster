import React from "react";
import { View, StyleSheet, type ViewStyle } from "react-native";
import { COLORS } from "@/utils/constants";

interface DividerProps {
  /** Custom color */
  color?: string;
  /** Vertical margin */
  spacing?: number;
  style?: ViewStyle;
}

export function Divider({ color, spacing = 0, style }: DividerProps) {
  return (
    <View
      style={[
        styles.divider,
        color != null && { backgroundColor: color },
        spacing > 0 && { marginVertical: spacing },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    width: "100%",
    backgroundColor: COLORS.border,
  },
});
