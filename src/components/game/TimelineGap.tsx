import React, { useEffect, useRef } from "react";
import { Text, StyleSheet, Animated, Easing, Platform } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { COLORS, DISPLAY_FONT, RADIUS, FONT } from "@/utils/constants";
import { CARD_HEIGHT } from "./TimelineCard";

const NATIVE_DRIVER = Platform.OS !== "web";

interface TimelineGapProps {
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  label?: string;
}

/** A vertical drop slot between two cards in the horizontal timeline */
export function TimelineGap({
  onPress,
  selected = false,
  disabled = false,
  label,
}: TimelineGapProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!selected) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: NATIVE_DRIVER,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: NATIVE_DRIVER,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [selected, pulse]);

  const wide = label != null;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      label={label ?? "Place song here"}
      style={[
        styles.slot,
        selected && styles.selected,
        wide && styles.slotWide, // wide label slots keep their width when selected
        disabled && styles.disabled,
      ]}
    >
      <Animated.View
        style={
          selected
            ? {
                transform: [
                  {
                    scale: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.25],
                    }),
                  },
                ],
              }
            : undefined
        }
      >
        <Text style={[styles.icon, selected && styles.iconSelected]}>
          {selected ? "▼" : "+"}
        </Text>
      </Animated.View>
      {wide && <Text style={styles.label}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: {
    width: 34,
    height: CARD_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: COLORS.textSecondary,
    opacity: 0.35,
    gap: 6,
  },
  slotWide: {
    width: 120,
  },
  selected: {
    opacity: 1,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentLight,
    width: 46,
  },
  disabled: {
    opacity: 0.15,
  },
  icon: {
    fontFamily: DISPLAY_FONT,
    fontSize: FONT.size["2xl"],
    color: COLORS.textSecondary,
  },
  iconSelected: {
    color: COLORS.accent,
  },
  label: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
});
