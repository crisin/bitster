import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { COLORS } from "@/utils/constants";

interface NowPlayingProps {
  error?: string | null;
}

function AnimatedBar({ delay }: { delay: number }) {
  const anim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 400,
          delay,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0.5,
          duration: 400,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim, delay]);

  return (
    <Animated.View
      style={[styles.bar, { transform: [{ scaleY: anim }] }]}
    />
  );
}

export function NowPlaying({ error }: NowPlayingProps) {
  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.bars}>
        <AnimatedBar delay={0} />
        <AnimatedBar delay={100} />
        <AnimatedBar delay={200} />
        <AnimatedBar delay={300} />
      </View>
      <Text style={styles.text}>Song playing...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    height: 20,
  },
  bar: {
    width: 4,
    height: 18,
    backgroundColor: COLORS.accent,
    borderRadius: 2,
  },
  text: {
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 14,
  },
});
