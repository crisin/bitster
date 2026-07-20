import React from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SPACE } from "@/utils/constants";
import { createThemedStyles } from "@/theme/themedStyles";

interface BottomBarProps {
  children: React.ReactNode;
}

export function BottomBar({ children }: BottomBarProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: Math.max(insets.bottom, SPACE.lg) },
      ]}
    >
      {children}
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) =>
  StyleSheet.create({
    container: {
      borderTopWidth: 1,
      borderTopColor: COLORS.border,
      backgroundColor: COLORS.bgPrimary,
      paddingHorizontal: SPACE.xl,
      paddingTop: SPACE.md,
    },
  }),
);
