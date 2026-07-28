import { RoundLog } from "@/components/game/RoundLog";
import { Pressable } from "@/components/ui/Pressable";
import {
  bestRound,
  computeAllTime,
  decadeHistogram,
  findNemesis,
  knownPlayers,
  songLeaderboard,
  type Who,
} from "@/history/aggregate";
import { isProvisional } from "@/history/identity";
import { useHistoryStore } from "@/history/store";
import { createThemedStyles } from "@/theme/themedStyles";
import { DISPLAY_FONT, FONT, LAYOUT, RADIUS, SPACE } from "@/utils/constants";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const NATIVE_DRIVER = Platform.OS !== "web";

const DECADE_EMOJI: Record<number, string> = {
  1950: "🕺",
  1960: "☮️",
  1970: "🕶️",
  1980: "📼",
  1990: "💿",
  2000: "📱",
  2010: "🎧",
  2020: "🛸",
};

const COUNT_UP_MS = 900;

/**
 * True when an animation would never actually run: a hidden tab starves
 * requestAnimationFrame, and some people ask for no motion at all. In both
 * cases the value must be shown outright — a number frozen at 0 is a lie.
 */
function prefersInstant(): boolean {
  if (typeof document !== "undefined" && document.visibilityState === "hidden")
    return true;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  return false;
}

/** Counts up from 0 on mount — a static number is a wasted opportunity */
function CountUp({ value, suffix }: { value: number; suffix?: string }) {
  const styles = useStyles();
  const [shown, setShown] = useState(() => (prefersInstant() ? value : 0));

  useEffect(() => {
    if (value === 0 || prefersInstant()) {
      setShown(value);
      return;
    }
    const start = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / COUNT_UP_MS);
      // Ease out cubic, same feel as the bars
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // Safety net: if frames never arrive, the real number still lands
    const settle = setTimeout(() => setShown(value), COUNT_UP_MS + 100);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [value]);

  return (
    <Text style={styles.heroNumber}>
      {shown}
      {suffix}
    </Text>
  );
}

function DecadeBar({
  decade,
  seen,
  hit,
  max,
  index,
}: {
  decade: number;
  seen: number;
  hit: number;
  max: number;
  index: number;
}) {
  const styles = useStyles();
  const grow = useRef(new Animated.Value(0)).current;
  const share = max > 0 ? seen / max : 0;
  const rate = seen > 0 ? Math.round((hit / seen) * 100) : 0;

  useEffect(() => {
    // Same rule as the hero number: without frames the bar must still show its
    // real length rather than staying empty.
    if (prefersInstant()) {
      grow.setValue(share);
      return;
    }
    // Width rather than scaleX: scaling would grow the bar from its centre
    // (transformOrigin is not a React Native style property).
    Animated.timing(grow, {
      toValue: share,
      duration: 650,
      delay: index * 90,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [grow, index, share]);

  return (
    <View style={styles.decadeRow}>
      <Text style={styles.decadeLabel}>
        {DECADE_EMOJI[decade] ?? "🎵"} {decade}s
      </Text>
      <View style={styles.decadeTrack}>
        <Animated.View
          style={[
            styles.decadeFill,
            {
              width: grow.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
            },
          ]}
        />
        <Text style={styles.decadeValue}>
          {hit}/{seen} · {rate}%
        </Text>
      </View>
    </View>
  );
}

/**
 * All-time stats for whoever plays on this device. Everything here is local:
 * nothing was ever uploaded, and the streaming account id it is keyed by never
 * left the device either.
 */
export default function StatsScreen() {
  const styles = useStyles();
  const games = useHistoryStore((s) => s.games);
  const identityId = useHistoryStore((s) => s.identityId);
  const clear = useHistoryStore((s) => s.clear);
  const [localName, setLocalName] = useState<string | null>(null);
  const [includeDemo, setIncludeDemo] = useState(false);

  const who: Who = useMemo(
    () => ({ identityId: identityId ?? "", localName }),
    [identityId, localName],
  );
  const opts = useMemo(() => ({ includeDemo }), [includeDemo]);

  const seats = useMemo(
    () => (identityId ? knownPlayers(games, identityId) : []),
    [games, identityId],
  );
  const stats = useMemo(
    () => computeAllTime(games, who, opts),
    [games, who, opts],
  );
  const decades = useMemo(
    () => decadeHistogram(games, who, opts),
    [games, who, opts],
  );
  const nemesis = useMemo(
    () => findNemesis(games, who, opts),
    [games, who, opts],
  );
  const fastest = useMemo(() => bestRound(games, who, opts), [games, who, opts]);
  const songs = useMemo(
    () => songLeaderboard(games, who, opts).slice(0, 5),
    [games, who, opts],
  );
  const recent = useMemo(
    () =>
      games
        .filter((g) => g.identityId === identityId)
        .slice(0, 10),
    [games, identityId],
  );

  const [expanded, setExpanded] = useState<string | null>(null);
  const maxSeen = decades.reduce((m, d) => Math.max(m, d.seen), 0);

  const handleWipe = () => {
    const wipe = () => void clear();
    if (Platform.OS === "web") {
      if (window.confirm("Delete every stored game on this device?")) wipe();
    } else {
      Alert.alert("Wipe history?", "Every stored game on this device goes.", [
        { text: "Keep", style: "cancel" },
        { text: "Wipe", style: "destructive", onPress: wipe },
      ]);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
          label="Go back"
          style={styles.backBtn}
        >
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Stats</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {games.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>NO GAMES YET</Text>
            <Text style={styles.emptyBody}>
              go make some bad decisions
            </Text>
          </View>
        ) : (
          <>
            {/* Whose numbers these are */}
            <Text style={styles.identity}>
              {identityId && isProvisional(identityId)
                ? "Not linked to a streaming account — these stay on this device"
                : "Linked to your streaming account, stored on this device only"}
            </Text>

            {seats.length > 1 && (
              <View style={styles.chipRow}>
                {seats.map((seat) => {
                  const active = seat.localName === localName;
                  return (
                    <Pressable
                      key={seat.localName ?? "__me"}
                      onPress={() => setLocalName(seat.localName)}
                      label={`Show stats for ${seat.localName ?? "me"}`}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text
                        style={[styles.chipText, active && styles.chipTextActive]}
                      >
                        {seat.localName ?? "Me"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Career hero */}
            <View style={styles.hero}>
              <CountUp value={Math.round(stats.winRate * 100)} suffix="%" />
              <Text style={styles.heroLabel}>WIN RATE</Text>
              <Text style={styles.heroSub}>
                {stats.wins} of {stats.games} game
                {stats.games === 1 ? "" : "s"}
              </Text>
            </View>

            <View style={styles.tileRow}>
              <Tile
                value={`${Math.round(stats.hitRate * 100)}%`}
                label="hit rate"
              />
              <Tile value={String(stats.steals)} label="cards stolen" />
              <Tile value={String(stats.longestTimeline)} label="best run" />
              <Tile
                value={
                  stats.medianPlaceMs !== null
                    ? `${(stats.medianPlaceMs / 1000).toFixed(1)}s`
                    : "–"
                }
                label="typical drop"
              />
            </View>

            <Pressable
              onPress={() => setIncludeDemo((v) => !v)}
              label="Toggle demo games"
              style={styles.toggle}
            >
              <Text style={styles.toggleText}>
                {includeDemo ? "☑" : "☐"} count demo games
              </Text>
            </Pressable>

            {decades.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Your decades</Text>
                {decades.map((bucket, i) => (
                  <DecadeBar
                    key={bucket.decade}
                    decade={bucket.decade}
                    seen={bucket.seen}
                    hit={bucket.hit}
                    max={maxSeen}
                    index={i}
                  />
                ))}
              </View>
            )}

            {nemesis && (
              <View style={styles.wanted}>
                <Text style={styles.wantedLabel}>WANTED</Text>
                <Text style={styles.wantedName} numberOfLines={1}>
                  {nemesis.name}
                </Text>
                <Text style={styles.wantedBody}>
                  stole {nemesis.stealsAgainstMe} card
                  {nemesis.stealsAgainstMe === 1 ? "" : "s"} off you
                  {nemesis.stealsByMe > 0
                    ? ` · you got ${nemesis.stealsByMe} back`
                    : " · you got none back"}
                </Text>
              </View>
            )}

            {fastest && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Fastest drop</Text>
                <Text style={styles.fastestTime}>
                  {((fastest.round.placeMs ?? 0) / 1000).toFixed(1)}s
                </Text>
                <Text style={styles.body} numberOfLines={1}>
                  {fastest.round.song.name} — {fastest.round.song.artist} (
                  {fastest.round.song.year})
                </Text>
              </View>
            )}

            {songs.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Songs you keep meeting</Text>
                {songs.map((tally) => (
                  <View key={tally.song.id} style={styles.songRow}>
                    <Text style={styles.songName} numberOfLines={1}>
                      {tally.song.name}
                    </Text>
                    <Text style={styles.songMeta}>
                      {tally.seen}× · {tally.missed} missed
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {recent.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Last games</Text>
                {recent.map((game) => (
                  <View key={game.id}>
                    <Pressable
                      onPress={() =>
                        setExpanded((id) => (id === game.id ? null : game.id))
                      }
                      label={`Toggle the round log for ${game.recap.roomCode}`}
                      style={styles.gameRow}
                    >
                      <Text style={styles.gameCode}>
                        {game.recap.roomCode}
                        {game.recap.demo ? " · demo" : ""}
                      </Text>
                      <Text style={styles.gameMeta}>
                        {game.recap.rounds.length} rounds ·{" "}
                        {game.recap.endedReason === "win"
                          ? "won by " +
                            (game.recap.players.find(
                              (p) => p.id === game.recap.winnerId,
                            )?.name ?? "somebody")
                          : game.recap.endedReason === "abandoned"
                            ? "abandoned"
                            : "playlist ran out"}
                      </Text>
                    </Pressable>
                    {expanded === game.id && (
                      <RoundLog rounds={game.recap.rounds} initiallyOpen />
                    )}
                  </View>
                ))}
              </View>
            )}

            <Pressable
              onPress={handleWipe}
              label="Delete all stored games"
              style={styles.wipeBtn}
            >
              <Text style={styles.wipeText}>Wipe history</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: COLORS.bgPrimary },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.sm,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
    },
    backBtn: { width: 44, height: 44, justifyContent: "center" },
    backIcon: { fontSize: 32, color: COLORS.textPrimary, lineHeight: 34 },
    headerTitle: {
      fontFamily: DISPLAY_FONT,
      fontSize: 24,
      letterSpacing: 3,
      color: COLORS.textPrimary,
    },
    scroll: { flex: 1 },
    content: {
      padding: SPACE.lg,
      gap: SPACE.lg,
      maxWidth: LAYOUT.maxContentWidth,
      width: "100%",
      alignSelf: "center",
      paddingBottom: SPACE["4xl"],
    },
    identity: {
      fontSize: FONT.size.xs,
      color: COLORS.textSecondary,
      textAlign: "center",
      opacity: 0.8,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: SPACE.sm,
      justifyContent: "center",
    },
    chip: {
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.xs,
      borderRadius: RADIUS.full,
      borderWidth: 1,
      borderColor: COLORS.border,
      minHeight: 36,
      justifyContent: "center",
    },
    chipActive: {
      borderColor: COLORS.accent,
      backgroundColor: COLORS.accentLight,
    },
    chipText: { fontSize: FONT.size.sm, color: COLORS.textSecondary },
    chipTextActive: { color: COLORS.accent, fontWeight: FONT.weight.bold },
    hero: {
      alignItems: "center",
      paddingVertical: SPACE.xl,
      borderRadius: RADIUS.lg,
      borderWidth: 2,
      borderColor: COLORS.accent,
      backgroundColor: COLORS.accentLight,
    },
    heroNumber: {
      fontFamily: DISPLAY_FONT,
      fontSize: 76,
      lineHeight: 82,
      color: COLORS.accent,
    },
    heroLabel: {
      fontFamily: DISPLAY_FONT,
      fontSize: 20,
      letterSpacing: 4,
      color: COLORS.textPrimary,
    },
    heroSub: { fontSize: FONT.size.sm, color: COLORS.textSecondary },
    tileRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: SPACE.sm,
      justifyContent: "center",
    },
    tile: {
      minWidth: 96,
      flexGrow: 1,
      alignItems: "center",
      paddingVertical: SPACE.md,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgCard,
    },
    tileValue: {
      fontFamily: DISPLAY_FONT,
      fontSize: 30,
      color: COLORS.textPrimary,
    },
    tileLabel: {
      fontSize: FONT.size.xs,
      color: COLORS.textSecondary,
      textTransform: "uppercase",
      letterSpacing: FONT.tracking.wide,
    },
    toggle: { alignSelf: "center", minHeight: 36, justifyContent: "center" },
    toggleText: { fontSize: FONT.size.sm, color: COLORS.textSecondary },
    card: {
      gap: SPACE.sm,
      padding: SPACE.lg,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgCard,
    },
    sectionTitle: {
      fontSize: FONT.size.sm,
      fontWeight: FONT.weight.bold,
      color: COLORS.textSecondary,
      textTransform: "uppercase",
      letterSpacing: FONT.tracking.wider,
    },
    body: { fontSize: FONT.size.sm, color: COLORS.textSecondary },
    decadeRow: { gap: 2 },
    decadeLabel: { fontSize: FONT.size.sm, color: COLORS.textPrimary },
    decadeTrack: {
      height: 26,
      borderRadius: RADIUS.sm,
      backgroundColor: COLORS.bgPrimary,
      justifyContent: "center",
      overflow: "hidden",
    },
    decadeFill: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      backgroundColor: COLORS.accent,
      opacity: 0.35,
    },
    decadeValue: {
      paddingHorizontal: SPACE.sm,
      fontSize: FONT.size.xs,
      color: COLORS.textPrimary,
      fontWeight: FONT.weight.bold,
    },
    wanted: {
      alignItems: "center",
      gap: 2,
      paddingVertical: SPACE.lg,
      borderRadius: RADIUS.lg,
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: COLORS.error,
    },
    wantedLabel: {
      fontFamily: DISPLAY_FONT,
      fontSize: 18,
      letterSpacing: 6,
      color: COLORS.error,
    },
    wantedName: {
      fontFamily: DISPLAY_FONT,
      fontSize: 42,
      color: COLORS.textPrimary,
    },
    wantedBody: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
      textAlign: "center",
      paddingHorizontal: SPACE.md,
    },
    fastestTime: {
      fontFamily: DISPLAY_FONT,
      fontSize: 40,
      color: COLORS.yearText,
    },
    songRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: SPACE.md,
      alignItems: "center",
    },
    songName: { flex: 1, fontSize: FONT.size.sm, color: COLORS.textPrimary },
    songMeta: { fontSize: FONT.size.xs, color: COLORS.textSecondary },
    gameRow: { paddingVertical: SPACE.sm, minHeight: 44 },
    gameCode: {
      fontFamily: DISPLAY_FONT,
      fontSize: 20,
      letterSpacing: 2,
      color: COLORS.textPrimary,
    },
    gameMeta: { fontSize: FONT.size.xs, color: COLORS.textSecondary },
    wipeBtn: { alignSelf: "center", minHeight: 44, justifyContent: "center" },
    wipeText: { fontSize: FONT.size.sm, color: COLORS.error },
    empty: { alignItems: "center", gap: SPACE.sm, paddingVertical: SPACE["4xl"] },
    emptyTitle: {
      fontFamily: DISPLAY_FONT,
      fontSize: 44,
      letterSpacing: 4,
      color: COLORS.textPrimary,
      textAlign: "center",
    },
    emptyBody: { fontSize: FONT.size.base, color: COLORS.textSecondary },
  }),
);
