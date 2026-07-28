import { useGameStore } from "@/game/store";
import { useP2PStore } from "@/p2p/store";
import { createThemedStyles } from "@/theme/themedStyles";
import {
  DISPLAY_FONT,
  FONT,
  LABEL_STYLE,
  RADIUS,
  SPACE,
} from "@/utils/constants";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { MiniTimeline, type MiniSong } from "./MiniTimeline";

interface AllPlayerTimelinesProps {
  /** Hide the year of the current player's freshly placed card (bitster-window) */
  hideCurrentYear?: boolean;
}

/** Compact rail of every player: name, score, tokens, mini timeline. */
export function AllPlayerTimelines({
  hideCurrentYear = false,
}: AllPlayerTimelinesProps) {
  const styles = useStyles();
  const players = useGameStore((s) => s.players);
  const timelines = useGameStore((s) => s.timelines);
  const failedTimelines = useGameStore((s) => s.failedTimelines);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const currentSongId = useGameStore((s) => s.currentSongId);
  const winScore = useGameStore((s) => s.settings.winScore);
  const myPeerId = useP2PStore((s) => s.myPeerId);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Players</Text>
      {players.map((p) => {
        const isCurrent = p.id === currentPlayerId;
        const songs: MiniSong[] = [
          ...(timelines[p.id] ?? []).map((s) => ({ ...s, failed: false })),
          ...(failedTimelines[p.id] ?? []).map((s) => ({ ...s, failed: true })),
        ].sort((a, b) => a.year - b.year);

        return (
          <View
            key={p.id}
            style={[styles.rail, isCurrent && styles.railCurrent]}
          >
            <View style={styles.railHeader}>
              <View style={styles.railLeft}>
                {isCurrent && <Text style={styles.turnDot}>▶</Text>}
                <Text
                  style={[styles.name, isCurrent && styles.nameCurrent]}
                  numberOfLines={1}
                >
                  {p.name}
                  {p.id === myPeerId ? " (you)" : p.isLocal ? " (local)" : ""}
                </Text>
                {!p.connected && (
                  <Text style={styles.offline} numberOfLines={1}>
                    · reconnecting
                  </Text>
                )}
              </View>
              <View style={styles.railRight}>
                {p.tokens > 0 && (
                  <Text
                    style={styles.tokens}
                    accessibilityLabel={`${p.tokens} tokens`}
                  >
                    {"★".repeat(p.tokens)}
                  </Text>
                )}
                <Text style={styles.score}>
                  {p.score}
                  <Text style={styles.scoreMax}>/{winScore}</Text>
                </Text>
              </View>
            </View>
            <MiniTimeline
              songs={songs}
              hiddenYearSongId={
                hideCurrentYear && isCurrent ? currentSongId : undefined
              }
            />
          </View>
        );
      })}
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) =>
  StyleSheet.create({
    section: {
      width: "100%",
      gap: SPACE.sm,
    },
    sectionTitle: {
      ...LABEL_STYLE,
      color: COLORS.textSecondary,
      marginBottom: SPACE.xs,
    },
    rail: {
      width: "100%",
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgCard,
      paddingVertical: SPACE.sm,
      paddingHorizontal: SPACE.md,
      gap: SPACE.xs,
    },
    railCurrent: {
      borderColor: COLORS.accent,
      backgroundColor: COLORS.bgElevated,
    },
    railHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: SPACE.sm,
    },
    railLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.sm,
      flexShrink: 1,
    },
    railRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.md,
    },
    turnDot: {
      color: COLORS.accent,
      fontSize: FONT.size.xs,
    },
    name: {
      fontSize: FONT.size.base,
      fontWeight: FONT.weight.semibold,
      color: COLORS.textPrimary,
      flexShrink: 1,
    },
    nameCurrent: {
      color: COLORS.accent,
    },
    offline: {
      fontSize: FONT.size.xs,
      color: COLORS.textSecondary,
      opacity: 0.6,
      flexShrink: 0,
    },
    tokens: {
      fontSize: FONT.size.sm,
      color: COLORS.warning,
      letterSpacing: 1,
    },
    score: {
      fontFamily: DISPLAY_FONT,
      fontSize: FONT.size.xl,
      color: COLORS.textPrimary,
      letterSpacing: 1,
    },
    scoreMax: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
    },
  }),
);
