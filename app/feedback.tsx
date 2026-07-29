import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { Pressable } from "@/components/ui/Pressable";
import {
  fetchFeedback,
  submitFeedback,
  voteFeedback,
  type FeedbackEntry,
} from "@/feedback/api";
import { createThemedStyles } from "@/theme/themedStyles";
import { DISPLAY_FONT, FONT, LAYOUT, RADIUS, SPACE } from "@/utils/constants";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Filter = "all" | "bug" | "idea";

/**
 * The public feedback board: bugs and ideas from everyone, votes decide what
 * matters. Lives on the relay server — the one server that already exists.
 */
export default function FeedbackScreen() {
  const styles = useStyles();
  const [entries, setEntries] = useState<FeedbackEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const [composing, setComposing] = useState(false);
  const [type, setType] = useState<"bug" | "idea">("idea");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    setError(null);
    fetchFeedback()
      .then(setEntries)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  const handleSubmit = async () => {
    if (title.trim().length < 3 || sending) return;
    setSending(true);
    setError(null);
    try {
      const next = await submitFeedback({
        type,
        title: title.trim(),
        body: body.trim(),
        author: author.trim(),
      });
      setEntries(next);
      setTitle("");
      setBody("");
      setComposing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sending failed");
    } finally {
      setSending(false);
    }
  };

  const handleVote = async (id: string) => {
    try {
      setEntries(await voteFeedback(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vote failed");
    }
  };

  const shown =
    entries?.filter((e) => filter === "all" || e.type === filter) ?? [];

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
        <Text style={styles.headerTitle}>Feedback</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.pitch}>
          Found a bug? Got an idea? Everyone sees the board, votes push things
          up. Your entry travels with a random device id — no account, no
          tracking.
        </Text>

        {!composing ? (
          <Button
            title="✍️ New entry"
            onPress={() => setComposing(true)}
            label="Write a new feedback entry"
          />
        ) : (
          <View style={styles.composer}>
            <View style={styles.chipRow}>
              <Chip
                label="💡 Idea"
                selected={type === "idea"}
                onPress={() => setType("idea")}
              />
              <Chip
                label="🐛 Bug"
                selected={type === "bug"}
                onPress={() => setType("bug")}
              />
            </View>
            <Input
              placeholder="One line that says it all"
              label="Feedback title"
              value={title}
              onChangeText={setTitle}
              maxLength={80}
            />
            <Input
              placeholder="Details (optional)"
              label="Feedback details"
              value={body}
              onChangeText={setBody}
              maxLength={500}
              multiline
            />
            <Input
              placeholder="Name (optional)"
              label="Your name, optional"
              value={author}
              onChangeText={setAuthor}
              maxLength={24}
            />
            <View style={styles.composerButtons}>
              <Button
                title="Cancel"
                onPress={() => setComposing(false)}
                variant="ghost"
                compact
                label="Discard this entry"
              />
              <Button
                title={sending ? "Sending…" : "Post it"}
                onPress={handleSubmit}
                disabled={title.trim().length < 3 || sending}
                label="Post this feedback publicly"
              />
            </View>
          </View>
        )}

        {error && <Text style={styles.error}>⚠ {error}</Text>}

        <View style={styles.chipRow}>
          {(["all", "idea", "bug"] as const).map((f) => (
            <Chip
              key={f}
              label={f === "all" ? "All" : f === "idea" ? "💡 Ideas" : "🐛 Bugs"}
              selected={filter === f}
              onPress={() => setFilter(f)}
            />
          ))}
        </View>

        {entries === null && !error && (
          <Text style={styles.hint}>Loading the board…</Text>
        )}
        {entries !== null && shown.length === 0 && (
          <Text style={styles.hint}>
            Nothing here yet — be the first. ABFAHRT!
          </Text>
        )}

        {shown.map((entry) => (
          <View key={entry.id} style={styles.entry}>
            <Pressable
              onPress={() => handleVote(entry.id)}
              label={
                entry.mine
                  ? `Remove your vote from "${entry.title}"`
                  : `Vote for "${entry.title}"`
              }
              style={[styles.voteBox, entry.mine && styles.voteBoxMine]}
            >
              <Text style={[styles.voteArrow, entry.mine && styles.voteMine]}>
                ▲
              </Text>
              <Text style={[styles.voteCount, entry.mine && styles.voteMine]}>
                {entry.votes}
              </Text>
            </Pressable>
            <View style={styles.entryBody}>
              <Text style={styles.entryTitle}>
                {entry.type === "bug" ? "🐛 " : "💡 "}
                {entry.title}
              </Text>
              {entry.body ? (
                <Text style={styles.entryText}>{entry.body}</Text>
              ) : null}
              <Text style={styles.entryMeta}>
                {entry.author || "anonymous"} ·{" "}
                {new Date(entry.createdAt).toLocaleDateString()}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((COLORS) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: "transparent" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.sm,
    },
    backBtn: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    backIcon: {
      fontSize: 30,
      color: COLORS.textSecondary,
    },
    headerTitle: {
      flex: 1,
      textAlign: "center",
      fontFamily: DISPLAY_FONT,
      fontSize: 24,
      letterSpacing: 2,
      color: COLORS.textPrimary,
    },
    scroll: { flex: 1 },
    content: {
      gap: SPACE.md,
      padding: SPACE.lg,
      maxWidth: 640,
      width: "100%",
      alignSelf: "center",
      paddingBottom: SPACE["2xl"],
    },
    pitch: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
      lineHeight: 20,
    },
    composer: {
      gap: SPACE.sm,
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgCard,
    },
    composerButtons: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: SPACE.sm,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: SPACE.sm,
    },
    error: {
      fontSize: FONT.size.sm,
      color: COLORS.error,
    },
    hint: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
      textAlign: "center",
      paddingVertical: SPACE.lg,
    },
    entry: {
      flexDirection: "row",
      gap: SPACE.md,
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgCard,
    },
    voteBox: {
      minWidth: 48,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: COLORS.border,
      paddingVertical: SPACE.sm,
    },
    voteBoxMine: {
      borderColor: COLORS.accent,
      backgroundColor: COLORS.accentLight,
    },
    voteArrow: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
    },
    voteCount: {
      fontSize: FONT.size.md,
      fontWeight: FONT.weight.bold,
      color: COLORS.textPrimary,
      fontVariant: ["tabular-nums"],
    },
    voteMine: {
      color: COLORS.accent,
    },
    entryBody: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    entryTitle: {
      fontSize: FONT.size.base,
      fontWeight: FONT.weight.semibold,
      color: COLORS.textPrimary,
    },
    entryText: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
      lineHeight: 19,
    },
    entryMeta: {
      fontSize: FONT.size.xs,
      color: COLORS.textSecondary,
      opacity: 0.7,
    },
  }),
);
