import React, { useEffect, useRef } from "react";
import { Text, View, StyleSheet, Animated, Easing, Platform } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { DISPLAY_FONT, RADIUS, SPACE, FONT } from "@/utils/constants";
import { createThemedStyles } from "@/theme/themedStyles";

const NATIVE_DRIVER = Platform.OS !== "web";
const SIZE = 132;

interface BuzzerButtonProps {
  onPress: () => void;
  disabled: boolean;
  buzzerName?: string | null;
}

/** The big red-hot party buzzer. Ring pulses while a challenge is possible. */
export function BuzzerButton({ onPress, disabled, buzzerName }: BuzzerButtonProps) {
  const styles = useStyles();
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (disabled || buzzerName) return;
    const loop = Animated.loop(
      Animated.timing(ring, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: NATIVE_DRIVER,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      ring.setValue(0);
    };
  }, [ring, disabled, buzzerName]);

  if (buzzerName) {
    return (
      <View
        style={styles.claimedContainer}
        accessibilityRole="text"
        accessibilityLabel={`${buzzerName} buzzed`}
      >
        <Text style={styles.claimedBolt}>⚡</Text>
        <Text style={styles.claimedText}>{buzzerName} buzzed!</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {!disabled && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulseRing,
            {
              opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
              transform: [
                { scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) },
              ],
            },
          ]}
        />
      )}
      <Pressable
        onPress={onPress}
        disabled={disabled}
        label="Hitster buzz — costs 1 star"
        style={[styles.button, disabled && styles.disabled]}
      >
        <Text style={styles.label}>HITSTER!</Text>
        <Text style={styles.cost}>1★</Text>
      </Pressable>
      {disabled && <Text style={styles.noTokens}>no ★ left to challenge</Text>}
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) => StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACE.sm,
  },
  pulseRing: {
    position: "absolute",
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 3,
    borderColor: COLORS.warning,
  },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 3,
    borderColor: COLORS.warning,
    backgroundColor: COLORS.warningLight,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.warning,
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  disabled: {
    opacity: 0.3,
    shadowOpacity: 0,
  },
  label: {
    fontFamily: DISPLAY_FONT,
    fontSize: 26,
    color: COLORS.warning,
    letterSpacing: 2,
  },
  cost: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.bold,
    color: COLORS.warning,
    marginTop: 2,
  },
  noTokens: {
    marginTop: SPACE.sm,
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
  },
  claimedContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.xl,
    borderRadius: RADIUS.full,
    borderWidth: 2,
    borderColor: COLORS.warning,
    backgroundColor: COLORS.warningLight,
  },
  claimedBolt: {
    fontSize: FONT.size.xl,
  },
  claimedText: {
    fontFamily: DISPLAY_FONT,
    fontSize: FONT.size["2xl"],
    color: COLORS.warning,
    letterSpacing: 1.5,
  },
}));
