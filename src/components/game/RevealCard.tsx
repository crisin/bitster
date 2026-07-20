import React, { useEffect, useRef } from "react";
import { View, Text, Image, StyleSheet, Animated, Easing, Platform } from "react-native";
import { DISPLAY_FONT, FONT, RADIUS, SPACE } from "@/utils/constants";
import { createThemedStyles, useThemeColors } from "@/theme/themedStyles";
import type { Song } from "@/game/types";

const NATIVE_DRIVER = Platform.OS !== "web";

const CARD_W = 240;
const CARD_H = 380;
// Fixed cover size so title, artist and year always fit below it —
// at full card width a two-line title used to push the artist off the card
const COVER_SIZE = 168;

interface RevealCardProps {
  correct: boolean;
  song: Song;
}

/**
 * The big moment: the mystery card flips over to reveal the song, then the
 * verdict slams down like a rubber stamp.
 */
export function RevealCard({ correct, song }: RevealCardProps) {
  const styles = useStyles();
  const COLORS = useThemeColors();
  const flip = useRef(new Animated.Value(0)).current;
  const stamp = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(350),
      Animated.timing(flip, {
        toValue: 1,
        duration: 650,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: NATIVE_DRIVER,
      }),
      Animated.delay(150),
      Animated.spring(stamp, {
        toValue: 1,
        friction: 5,
        tension: 120,
        useNativeDriver: NATIVE_DRIVER,
      }),
    ]).start(() => {
      if (!correct) {
        Animated.sequence([
          Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: NATIVE_DRIVER }),
          Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: NATIVE_DRIVER }),
          Animated.timing(shake, { toValue: 0.6, duration: 60, useNativeDriver: NATIVE_DRIVER }),
          Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: NATIVE_DRIVER }),
        ]).start();
      }
    });
  }, [flip, stamp, shake, correct]);

  const color = correct ? COLORS.success : COLORS.error;
  const label = correct ? "CORRECT!" : "WRONG!";

  const frontRotate = flip.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });
  const backRotate = flip.interpolate({
    inputRange: [0, 1],
    outputRange: ["180deg", "360deg"],
  });
  const shakeX = shake.interpolate({
    inputRange: [-1, 1],
    outputRange: [-10, 10],
  });

  return (
    <Animated.View
      style={[styles.wrap, { transform: [{ translateX: shakeX }] }]}
      accessibilityRole="text"
      accessibilityLabel={`Result: ${label} ${song.name} by ${song.artist}, ${song.year}`}
    >
      {/* Mystery face */}
      <Animated.View
        style={[
          styles.face,
          styles.front,
          { transform: [{ perspective: 1200 }, { rotateY: frontRotate }] },
        ]}
      >
        <Text style={styles.mysteryMark}>?</Text>
        <Text style={styles.mysteryHint}>and the song was…</Text>
      </Animated.View>

      {/* Revealed face */}
      <Animated.View
        style={[
          styles.face,
          styles.back,
          { borderColor: color },
          { transform: [{ perspective: 1200 }, { rotateY: backRotate }] },
        ]}
      >
        {song.imageUrl != null ? (
          <Image source={{ uri: song.imageUrl }} style={styles.cover} />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]}>
            <Text style={styles.coverIcon}>♫</Text>
          </View>
        )}
        <Text style={styles.title} numberOfLines={2}>
          {song.name}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {song.artist}
        </Text>
        <Text style={styles.year}>{song.year}</Text>

        <Animated.View
          style={[
            styles.stamp,
            { borderColor: color },
            {
              opacity: stamp,
              transform: [
                {
                  scale: stamp.interpolate({
                    inputRange: [0, 1],
                    outputRange: [2.2, 1],
                  }),
                },
                { rotate: correct ? "-7deg" : "6deg" },
              ],
            },
          ]}
        >
          <Text style={[styles.stampText, { color }]}>{label}</Text>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const useStyles = createThemedStyles((COLORS) => StyleSheet.create({
  wrap: {
    width: CARD_W,
    height: CARD_H,
    alignSelf: "center",
  },
  face: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    borderRadius: RADIUS.xl,
    borderWidth: 2,
    backgroundColor: COLORS.bgCard,
    backfaceVisibility: "hidden",
    padding: SPACE.xl,
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  front: {
    borderColor: COLORS.warning,
    borderStyle: "dashed",
    justifyContent: "center",
    gap: SPACE.md,
  },
  back: {
    justifyContent: "flex-start",
  },
  mysteryMark: {
    fontFamily: DISPLAY_FONT,
    fontSize: 110,
    color: COLORS.warning,
  },
  mysteryHint: {
    color: COLORS.textSecondary,
    fontSize: FONT.size.base,
  },
  cover: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.secondary,
    marginBottom: SPACE.lg,
  },
  coverPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  coverIcon: {
    fontSize: 48,
    color: COLORS.textSecondary,
  },
  title: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.semibold,
    color: COLORS.textPrimary,
    textAlign: "center",
  },
  artist: {
    fontSize: FONT.size.base,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: 2,
  },
  year: {
    fontFamily: DISPLAY_FONT,
    fontSize: 52,
    color: COLORS.yearText,
    letterSpacing: 2,
    marginTop: "auto",
  },
  stamp: {
    position: "absolute",
    top: "38%",
    alignSelf: "center",
    borderWidth: 3,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.xs,
    backgroundColor: "rgba(10, 14, 24, 0.82)",
  },
  stampText: {
    fontFamily: DISPLAY_FONT,
    fontSize: 40,
    letterSpacing: 3,
  },
}));
