import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { COLORS, SIZES } from "@/utils/constants";

interface BadgeProps {
  label: string;
  color?: string;
}

export function Badge({ label, color = COLORS.accent }: BadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  text: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },
});
