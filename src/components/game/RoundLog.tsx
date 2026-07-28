import type { RerollReason } from "@/game/types";
import type { StoredRound } from "@/history/types";
import { createThemedStyles } from "@/theme/themedStyles";
import { DISPLAY_FONT, FONT, RADIUS, SPACE } from "@/utils/constants";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface RoundLogProps {
  rounds: StoredRound[];
  /** Collapsed by default on the end screen, open on the stats page */
  initiallyOpen?: boolean;
}

const STAMP: Record<StoredRound["outcome"], { label: string; tone: Tone }> = {
  placed: { label: "NAILED IT", tone: "success" },
  timeout: { label: "TOO SLOW", tone: "error" },
  skipped: { label: "SKIPPED", tone: "muted" },
  abandoned: { label: "WALKED OFF", tone: "muted" },
};

type Tone = "success" | "error" | "muted" | "warning";

function verdict(round: StoredRound): { label: string; tone: Tone } {
  if (round.outcome === "placed") {
    return round.correct
      ? { label: "NAILED IT", tone: "success" }
      : { label: "WRONG SPOT", tone: "error" };
  }
  return STAMP[round.outcome];
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

const REROLL_LABEL: Record<RerollReason, string> = {
  unplayable: "not playable",
  unusable: "unreadable",
  "fetch-retry": "Spotify hiccup",
};

interface LogEvent {
  key: string;
  icon: string;
  text: string;
  tone: Tone;
  /** Token movement caused by this event, if any */
  delta?: number;
}

/**
 * The story of one round as a list of things that happened. Every array is read
 * defensively: games stored before the event log existed have none of them, and
 * a history entry is replayed from disk without a per-round validator.
 */
export function roundEvents(round: StoredRound): LogEvent[] {
  const events: LogEvent[] = [];
  const tokens = round.tokens ?? [];
  const deltaFor = (...reasons: string[]): number | undefined => {
    const matching = tokens.filter((t) => reasons.includes(t.reason));
    if (matching.length === 0) return undefined;
    return matching.reduce((sum, t) => sum + t.delta, 0);
  };

  const rerolls = round.rerolls ?? [];
  if (rerolls.length > 0) {
    const counts = new Map<RerollReason, number>();
    for (const r of rerolls) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
    const detail = [...counts.entries()]
      .map(([reason, count]) => `${count}× ${REROLL_LABEL[reason]}`)
      .join(", ");
    events.push({
      key: "rerolls",
      icon: "🎲",
      text: `${rerolls.length} song${rerolls.length === 1 ? "" : "s"} rolled away first — ${detail}`,
      tone: "muted",
    });
  }

  const guess = round.guess;
  if (guess) {
    const parts: string[] = [];
    if (guess.title) parts.push(`“${guess.title}” ${guess.titleCorrect ? "✓" : "✗"}`);
    if (guess.artist) parts.push(`${guess.artist} ${guess.artistCorrect ? "✓" : "✗"}`);
    if (guess.year !== null) {
      parts.push(`${guess.year} ${guess.yearCorrect ? "✓" : "✗"}`);
    }
    const nailed = guess.titleCorrect && guess.artistCorrect;
    events.push({
      key: "guess",
      icon: nailed ? "💡" : "🤔",
      text: `${round.activePlayerName} guessed ${parts.join(" · ") || "nothing"}`,
      tone: nailed || guess.yearCorrect ? "success" : "muted",
      delta: deltaFor("guess-song", "guess-year"),
    });
  }

  if (round.outcome === "placed") {
    const when = round.placeMs !== null ? ` after ${seconds(round.placeMs)}` : "";
    events.push({
      key: "place",
      icon: round.correct ? "🎯" : "💥",
      text: `${round.activePlayerName} placed it ${round.correct ? "right" : "wrong"}${when}`,
      tone: round.correct ? "success" : "error",
    });
  } else if (round.outcome === "timeout") {
    events.push({
      key: "timeout",
      icon: "⏰",
      text: `${round.activePlayerName} ran out of time — the song is gone`,
      tone: "error",
    });
  } else if (round.outcome === "skipped") {
    events.push({
      key: "skip",
      icon: "⏭️",
      text: `${round.activePlayerName} skipped`,
      tone: "muted",
      delta: deltaFor("skip"),
    });
  } else {
    events.push({
      key: "abandoned",
      icon: "🚪",
      text: `${round.activePlayerName} was gone — round dropped`,
      tone: "muted",
    });
  }

  const passes = round.passes ?? [];
  if (passes.length > 0) {
    const names = passes.map((p) => p.playerName || "somebody").join(", ");
    events.push({
      key: "passes",
      icon: "🙅",
      text: `${names} passed`,
      tone: "muted",
    });
  }

  const buzz = round.buzz;
  if (buzz) {
    const who = buzz.playerName || "somebody";
    const text =
      buzz.position === null
        ? `${who} buzzed but never locked in`
        : buzz.stolen
          ? `${who} bitstered it and took the card`
          : `${who} bitstered and missed`;
    events.push({
      key: "buzz",
      icon: "⚡",
      text: buzz.penalty ? `${text} · −1 point, permanently` : text,
      tone: buzz.stolen ? "warning" : "muted",
      delta: deltaFor("buzz"),
    });
  }

  // Anything the events above did not account for still gets shown — a token
  // that moved for a reason nobody rendered is exactly the interesting case
  const shown = new Set(["guess-song", "guess-year", "skip", "buzz"]);
  for (const [i, token] of tokens.filter((t) => !shown.has(t.reason)).entries()) {
    events.push({
      key: `token-${i}`,
      icon: "★",
      text: `${token.playerName || "somebody"} · ${token.reason}`,
      tone: "muted",
      delta: token.delta,
    });
  }

  return events;
}

/** Short marks for the collapsed row, so a round hints at what is inside it */
function hints(round: StoredRound): string {
  const marks: string[] = [];
  if (round.guess) marks.push(round.guess.tokens > 0 ? "💡" : "🤔");
  if (round.buzz) marks.push("⚡");
  const rerolls = round.rerolls ?? [];
  if (rerolls.length > 0) marks.push(`🎲${rerolls.length}`);
  if (round.placeMs !== null && round.outcome === "placed") {
    marks.push(seconds(round.placeMs));
  }
  return marks.join("  ");
}

/**
 * The round-by-round story of one game: what played, who was up, and how it
 * went. Presentational only — it never reaches into a store.
 */
export function RoundLog({ rounds, initiallyOpen = false }: RoundLogProps) {
  const styles = useStyles();
  const [open, setOpen] = useState(initiallyOpen);
  const [expanded, setExpanded] = useState<number[]>([]);

  if (rounds.length === 0) return null;

  const toggleRound = (round: number) =>
    setExpanded((prev) =>
      prev.includes(round) ? prev.filter((r) => r !== round) : [...prev, round],
    );

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={`${open ? "Hide" : "Show"} the round log`}
        style={styles.header}
      >
        <Text style={styles.headerText}>
          {open ? "▾" : "▸"} Round log ({rounds.length})
        </Text>
      </Pressable>

      {open &&
        rounds.map((round) => {
          const { label, tone } = verdict(round);
          const isOpen = expanded.includes(round.round);
          const marks = hints(round);
          return (
            <View key={round.round} style={styles.row}>
              <Pressable
                onPress={() => toggleRound(round.round)}
                accessibilityRole="button"
                accessibilityLabel={`Round ${round.round}, ${round.song.name} — ${isOpen ? "hide" : "show"} details`}
                style={styles.rowHead}
              >
                <Text style={styles.year}>
                  {round.song.year > 0 ? round.song.year : "????"}
                </Text>
                <View style={styles.middle}>
                  <Text style={styles.song} numberOfLines={1}>
                    {round.song.name}
                  </Text>
                  <Text style={styles.artist} numberOfLines={1}>
                    {round.song.artist}
                  </Text>
                  <Text style={styles.who} numberOfLines={1}>
                    {round.activePlayerName}
                    {marks ? `  ·  ${marks}` : ""}
                  </Text>
                </View>
                <View style={styles.stampBox}>
                  <Text style={[styles.stamp, styles[tone]]}>{label}</Text>
                  <Text style={styles.chevron}>{isOpen ? "▾" : "▸"}</Text>
                </View>
              </Pressable>

              {isOpen && (
                <View style={styles.events}>
                  {roundEvents(round).map((event) => (
                    <View key={event.key} style={styles.event}>
                      <Text style={styles.eventIcon}>{event.icon}</Text>
                      <Text style={[styles.eventText, styles[event.tone]]}>
                        {event.text}
                      </Text>
                      {event.delta !== undefined && event.delta !== 0 && (
                        <Text
                          style={[
                            styles.delta,
                            event.delta > 0 ? styles.success : styles.error,
                          ]}
                        >
                          {/* Typographic minus, so it lines up with the +  */}
                          {event.delta > 0
                            ? `+${event.delta}`
                            : `−${Math.abs(event.delta)}`}
                          ★
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) =>
  StyleSheet.create({
    container: {
      width: "100%",
      gap: SPACE.xs,
    },
    header: {
      paddingVertical: SPACE.sm,
      minHeight: 36,
      justifyContent: "center",
    },
    headerText: {
      fontSize: FONT.size.sm,
      fontWeight: FONT.weight.bold,
      color: COLORS.textSecondary,
      textTransform: "uppercase",
      letterSpacing: FONT.tracking.wider,
    },
    row: {
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgCard,
      overflow: "hidden",
    },
    rowHead: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.md,
      paddingVertical: SPACE.sm,
      paddingHorizontal: SPACE.md,
    },
    year: {
      fontFamily: DISPLAY_FONT,
      fontSize: 26,
      color: COLORS.yearText,
      minWidth: 62,
    },
    middle: {
      flex: 1,
      minWidth: 0,
    },
    song: {
      fontSize: FONT.size.base,
      fontWeight: FONT.weight.semibold,
      color: COLORS.textPrimary,
    },
    artist: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
    },
    who: {
      fontSize: FONT.size.xs,
      color: COLORS.textSecondary,
      opacity: 0.7,
    },
    stampBox: {
      alignItems: "flex-end",
      gap: 2,
    },
    stamp: {
      fontFamily: DISPLAY_FONT,
      fontSize: 15,
      letterSpacing: 1,
      textAlign: "right",
      maxWidth: 96,
    },
    chevron: {
      fontSize: FONT.size.xs,
      color: COLORS.textSecondary,
      opacity: 0.6,
    },
    events: {
      gap: SPACE.xs,
      paddingHorizontal: SPACE.md,
      paddingBottom: SPACE.sm,
      paddingTop: SPACE.xs,
      borderTopWidth: 1,
      borderTopColor: COLORS.border,
    },
    event: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: SPACE.sm,
    },
    eventIcon: {
      fontSize: FONT.size.sm,
      width: 20,
    },
    eventText: {
      flex: 1,
      fontSize: FONT.size.sm,
      lineHeight: 20,
    },
    delta: {
      fontSize: FONT.size.sm,
      fontWeight: FONT.weight.bold,
      fontVariant: ["tabular-nums"],
    },
    success: {
      color: COLORS.success,
    },
    error: {
      color: COLORS.error,
    },
    warning: {
      color: COLORS.warning,
    },
    muted: {
      color: COLORS.textSecondary,
      opacity: 0.85,
    },
  }),
);
