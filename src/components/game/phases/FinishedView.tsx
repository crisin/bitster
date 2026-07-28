import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Easing, Linking, Platform, Pressable, useWindowDimensions } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useGameStore } from "@/game/store";
import { useHistoryStore } from "@/history/store";
import type { StoredRound } from "@/history/types";
import { useP2PStore } from "@/p2p/store";
import { Awards } from "@/components/game/Awards";
import { RoundLog } from "@/components/game/RoundLog";
import { ScoreBoard } from "@/components/game/ScoreBoard";
import { DISPLAY_FONT, FONT, RADIUS, SPACE } from "@/utils/constants";
import { createThemedStyles } from "@/theme/themedStyles";

const NATIVE_DRIVER = Platform.OS !== "web";
/** Stable reference so the selector doesn't re-render on every store write */
const EMPTY_ROUNDS: StoredRound[] = [];

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
  // The recap this device filed when the game ended — absent for an older host
  const rounds = useHistoryStore((s) => s.lastGame?.recap.rounds ?? EMPTY_ROUNDS);
  const playlistUrl = useGameStore((s) => s.playlistUrl);
  const playlistName = useGameStore((s) => s.playlistName);
  const [copied, setCopied] = useState(false);
  const { width } = useWindowDimensions();

  const handleCopy = () => {
    if (!playlistUrl) return;
    void Clipboard.setStringAsync(playlistUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={styles.container}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {CONFETTI.map((emoji, i) => (
          <ConfettiPiece key={i} emoji={emoji} index={i} width={Math.min(width, 480)} />
        ))}
      </View>

      <Text style={styles.gameOverTitle}>GAME OVER</Text>
      <ScoreBoard players={players} myId={myPeerId} />
      <Awards players={players} rounds={rounds} />

      {/* The playlist everyone just played — worth taking home */}
      {playlistUrl && (
        <View style={styles.playlistBox}>
          <Text style={styles.playlistLabel} numberOfLines={1}>
            ♫ {playlistName ?? "Playlist"}
          </Text>
          <View style={styles.playlistButtons}>
            <Pressable
              onPress={handleCopy}
              accessibilityRole="button"
              accessibilityLabel="Copy the playlist link"
              style={styles.playlistBtn}
            >
              <Text style={styles.playlistBtnText}>
                {copied ? "✓ COPIED" : "COPY LINK"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void Linking.openURL(playlistUrl)}
              accessibilityRole="button"
              accessibilityLabel="Open the playlist in Spotify"
              style={styles.playlistBtn}
            >
              <Text style={styles.playlistBtnText}>OPEN ↗</Text>
            </Pressable>
          </View>
        </View>
      )}

      <RoundLog rounds={rounds} />

      {rounds.length > 0 && (
        <Pressable
          onPress={() => router.push("/stats")}
          accessibilityRole="button"
          accessibilityLabel="Open all-time stats"
          style={styles.statsLink}
        >
          <Text style={styles.statsLinkText}>ALL-TIME STATS →</Text>
        </Pressable>
      )}
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
  playlistBox: {
    alignItems: "center",
    gap: SPACE.sm,
    paddingVertical: SPACE.lg,
    paddingHorizontal: SPACE.xl,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
    maxWidth: "100%",
  },
  playlistLabel: {
    fontSize: FONT.size.base,
    color: COLORS.textPrimary,
    maxWidth: 280,
  },
  playlistButtons: {
    flexDirection: "row",
    gap: SPACE.md,
  },
  playlistBtn: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  playlistBtnText: {
    fontFamily: DISPLAY_FONT,
    fontSize: 17,
    letterSpacing: 1.5,
    color: COLORS.accent,
  },
  statsLink: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: SPACE.lg,
  },
  statsLinkText: {
    fontFamily: DISPLAY_FONT,
    fontSize: 20,
    letterSpacing: 2,
    color: COLORS.accent,
  },
}));
