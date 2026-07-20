import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing, Platform } from "react-native";
import { COLORS, FONT, RADIUS, SPACE } from "@/utils/constants";

const NATIVE_DRIVER = Platform.OS !== "web";

interface NowPlayingProps {
  error?: string | null;
}

/** A little spinning vinyl record */
function Vinyl() {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 2400,
        easing: Easing.linear,
        useNativeDriver: NATIVE_DRIVER,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  return (
    <Animated.View
      style={[
        styles.vinyl,
        {
          transform: [
            {
              rotate: spin.interpolate({
                inputRange: [0, 1],
                outputRange: ["0deg", "360deg"],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.groove} />
      <View style={[styles.groove, styles.grooveInner]} />
      <View style={styles.vinylLabel} />
      {/* Off-center notch so the rotation is visible */}
      <View style={styles.notch} />
    </Animated.View>
  );
}

function AnimatedBar({ delay }: { delay: number }) {
  const anim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 380,
          delay,
          useNativeDriver: NATIVE_DRIVER,
        }),
        Animated.timing(anim, {
          toValue: 0.4,
          duration: 380,
          useNativeDriver: NATIVE_DRIVER,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, delay]);

  return <Animated.View style={[styles.bar, { transform: [{ scaleY: anim }] }]} />;
}

export function NowPlaying({ error }: NowPlayingProps) {
  if (error) {
    return (
      <View style={[styles.container, styles.errorContainer]} accessibilityRole="alert">
        <Text style={styles.errorIcon}>⚠</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      accessibilityRole="text"
      accessibilityLabel="Song is playing"
    >
      <Vinyl />
      <Text style={styles.text}>Song playing…</Text>
      <View style={styles.bars}>
        <AnimatedBar delay={0} />
        <AnimatedBar delay={120} />
        <AnimatedBar delay={240} />
        <AnimatedBar delay={90} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.xl,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignSelf: "center",
  },
  errorContainer: {
    borderColor: COLORS.warning,
    backgroundColor: COLORS.warningLight,
    borderRadius: RADIUS.lg,
    maxWidth: 480,
  },
  errorIcon: {
    fontSize: FONT.size.lg,
    color: COLORS.warning,
  },
  errorText: {
    color: COLORS.warning,
    fontSize: FONT.size.base,
    flexShrink: 1,
  },
  vinyl: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#0a0e18",
    alignItems: "center",
    justifyContent: "center",
  },
  groove: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(226, 228, 232, 0.14)",
  },
  grooveInner: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  vinylLabel: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accent,
  },
  notch: {
    position: "absolute",
    top: 3,
    left: 13,
    width: 2,
    height: 4,
    borderRadius: 1,
    backgroundColor: "rgba(226, 228, 232, 0.35)",
  },
  text: {
    color: COLORS.textPrimary,
    fontSize: FONT.size.md,
  },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    height: 18,
  },
  bar: {
    width: 3.5,
    height: 16,
    backgroundColor: COLORS.accent,
    borderRadius: 2,
  },
});
