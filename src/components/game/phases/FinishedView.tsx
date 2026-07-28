import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing, Platform, useWindowDimensions } from "react-native";
import { useGameStore } from "@/game/store";
import { useP2PStore } from "@/p2p/store";
import { Awards } from "@/components/game/Awards";
import { ScoreBoard } from "@/components/game/ScoreBoard";
import { DISPLAY_FONT, SPACE } from "@/utils/constants";
import { createThemedStyles } from "@/theme/themedStyles";

const NATIVE_DRIVER = Platform.OS !== "web";

const CONFETTI = ["🎉", "🎵", "★", "🎶", "✦", "🎊", "♪", "★"];

function ConfettiPiece({ emoji, index, width }: { emoji: string; index: number; width: number }) {
  const styles = useStyles();
  const fall = useRef(new Animated.Value(0)).current;
  // Deterministic per-index spread so we don't need Math.random on every render
  const x = ((index * 137) % 100) / 100;
  const drift = ((index * 61) % 40) - 20;
  const duration = 2200 + ((index * 271) % 1400);

  useEffect(() => {
    Animated.timing(fall, {
      toValue: 1,
      duration,
      delay: index * 160,
      easing: Easing.in(Easing.quad),
      useNativeDriver: NATIVE_DRIVER,
    }).start();
  }, [fall, duration, index]);

  return (
    <Animated.Text
      pointerEvents="none"
      style={[
        styles.confetti,
        {
          left: x * Math.max(width - 40, 0),
          opacity: fall.interpolate({
            inputRange: [0, 0.75, 1],
            outputRange: [1, 1, 0],
          }),
          transform: [
            { translateY: fall.interpolate({ inputRange: [0, 1], outputRange: [-40, 420] }) },
            { translateX: fall.interpolate({ inputRange: [0, 1], outputRange: [0, drift] }) },
            {
              rotate: fall.interpolate({
                inputRange: [0, 1],
                outputRange: ["0deg", `${drift * 14}deg`],
              }),
            },
          ],
        },
      ]}
    >
      {emoji}
    </Animated.Text>
  );
}

export function FinishedView() {
  const styles = useStyles();
  const players = useGameStore((s) => s.players);
  const myPeerId = useP2PStore((s) => s.myPeerId);
  const { width } = useWindowDimensions();

  return (
    <View style={styles.container}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {CONFETTI.map((emoji, i) => (
          <ConfettiPiece key={i} emoji={emoji} index={i} width={Math.min(width, 480)} />
        ))}
      </View>

      <Text style={styles.gameOverTitle}>GAME OVER</Text>
      <ScoreBoard players={players} myId={myPeerId} />
      <Awards players={players} />
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) => StyleSheet.create({
  container: {
    alignItems: "center",
    gap: SPACE["2xl"],
    width: "100%",
    paddingTop: SPACE.xl,
  },
  gameOverTitle: {
    fontFamily: DISPLAY_FONT,
    fontSize: 52,
    color: COLORS.textPrimary,
    letterSpacing: 6,
    textAlign: "center",
  },
  confetti: {
    position: "absolute",
    top: 0,
    fontSize: 22,
  },
}));
