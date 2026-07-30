import React, { useEffect, useRef } from "react";
import { View, Text, Image, StyleSheet, Animated, Easing, Platform } from "react-native";
import { DISPLAY_FONT, FONT, RADIUS, SPACE } from "@/utils/constants";
import { createThemedStyles, useThemeColors } from "@/theme/themedStyles";
import type { Song } from "@/game/types";

export const CARD_WIDTH = 104;
export const CARD_HEIGHT = 172;

const NATIVE_DRIVER = Platform.OS !== "web";

interface TimelineCardProps {
  song: Song;
  highlighted?: boolean;
  highlightColor?: string;
  /** Mystery mode — the card everyone is guessing about */
  hideYear?: boolean;
}

/** The pulsing "?" of the mystery card */
function MysteryMark() {
  const styles = useStyles();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: NATIVE_DRIVER,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: NATIVE_DRIVER,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.Text
      style={[
        styles.mysteryMark,
        {
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
          transform: [
            { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.06] }) },
          ],
        },
      ]}
    >
      ?
    </Animated.Text>
  );
}

/**
 * Memoized: on every broadcast the parent timeline re-renders, but a card
 * whose song/highlight props are unchanged (references survive via the
 * store reconcile) skips its Animated re-evaluation entirely.
 */
export const TimelineCard = React.memo(function TimelineCard({
  song,
  highlighted = false,
  highlightColor,
  hideYear = false,
}: TimelineCardProps) {
  const styles = useStyles();
  const COLORS = useThemeColors();
  const resolvedHighlightColor = highlightColor ?? COLORS.success;
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(enter, {
      toValue: 1,
      friction: 6,
      tension: 60,
      useNativeDriver: NATIVE_DRIVER,
    }).start();
  }, [enter]);

  return (
    <Animated.View
      accessibilityRole="text"
      accessibilityLabel={
        hideYear
          ? "Mystery song, year hidden"
          : `${song.name} by ${song.artist}, ${song.year}`
      }
      style={[
        styles.card,
        highlighted && { borderColor: resolvedHighlightColor, borderWidth: 2 },
        hideYear && styles.mysteryCard,
        {
          opacity: enter,
          transform: [
            { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
          ],
        },
      ]}
    >
      {hideYear ? (
        <View style={styles.mysteryCover}>
          <MysteryMark />
        </View>
      ) : song.imageUrl ? (
        <Image source={{ uri: song.imageUrl }} style={styles.cover} />
      ) : (
        <View style={styles.coverPlaceholder}>
          <Text style={styles.coverIcon}>♫</Text>
        </View>
      )}

      {/* The year IS the secret — the mystery card shows none at all */}
      {!hideYear && <Text style={styles.year}>{song.year}</Text>}

      <View style={[styles.info, hideYear && styles.infoMystery]}>
        <Text style={[styles.title, hideYear && styles.mysteryText]} numberOfLines={1}>
          {hideYear ? "· · ·" : song.name}
        </Text>
        <Text style={[styles.artist, hideYear && styles.mysteryText]} numberOfLines={1}>
          {hideYear ? "listen!" : song.artist}
        </Text>
      </View>
    </Animated.View>
  );
});

const COVER_SIZE = CARD_WIDTH - SPACE.sm * 2;

const useStyles = createThemedStyles((COLORS, theme) => StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    alignItems: "center",
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.sm,
    paddingHorizontal: SPACE.sm,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    // A card standing on a lit table
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  mysteryCard: {
    borderColor: COLORS.warning,
    borderWidth: 2,
    borderStyle: "dashed",
    backgroundColor: COLORS.bgElevated,
    ...(theme.effects.glow
      ? {
          shadowColor: COLORS.warning,
          shadowOpacity: 0.6,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 0 },
          elevation: 8,
        }
      : {}),
  },
  cover: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.secondary,
  },
  coverPlaceholder: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  coverIcon: {
    fontSize: FONT.size["3xl"],
    color: COLORS.textSecondary,
  },
  mysteryCover: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  mysteryMark: {
    fontFamily: DISPLAY_FONT,
    fontSize: 52,
    color: COLORS.warning,
  },
  year: {
    fontFamily: DISPLAY_FONT,
    fontSize: 34,
    lineHeight: 38,
    color: COLORS.yearText,
    marginTop: SPACE.xs,
    letterSpacing: 1,
  },
  info: {
    width: "100%",
    alignItems: "center",
  },
  // No year line on the mystery card — center the hint text in the free space
  infoMystery: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    fontSize: FONT.size.xs,
    color: COLORS.textPrimary,
    textAlign: "center",
  },
  artist: {
    fontSize: 10,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: 1,
  },
  mysteryText: {
    color: COLORS.warning,
    opacity: 0.8,
  },
}));
