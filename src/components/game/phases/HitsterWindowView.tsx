import React, { useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useGameStore } from "@/game/store";
import { useStreamingStore } from "@/streaming/store";
import { useCurrentPlayer } from "@/hooks/useCurrentPlayer";
import { dispatch } from "@/p2p/connection";
import { haptics } from "@/hooks/useHaptics";
import { Timeline } from "@/components/game/Timeline";
import { NowPlaying } from "@/components/game/NowPlaying";
import { BuzzerButton } from "@/components/game/BuzzerButton";
import { PlayedSongs } from "@/components/game/PlayedSongs";
import { AllPlayerTimelines } from "@/components/game/AllPlayerTimelines";
import { COLORS, FONT, RADIUS, SPACE, LABEL_STYLE } from "@/utils/constants";

interface HitsterWindowViewProps {
  buzzGap: number | null;
  onBuzzGapSelect: (position: number) => void;
}

export function HitsterWindowView({ buzzGap, onBuzzGapSelect }: HitsterWindowViewProps) {
  const players = useGameStore((s) => s.players);
  const buzzerId = useGameStore((s) => s.buzzerId);
  const settings = useGameStore((s) => s.settings);
  const timelines = useGameStore((s) => s.timelines);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const currentSongId = useGameStore((s) => s.currentSongId);
  const playedSongs = useGameStore((s) => s.playedSongs);
  const guessResult = useGameStore((s) => s.guessResult);
  const playbackError = useStreamingStore((s) => s.playbackError);
  const { isMyTurn, myTimeline, currentPlayer, me, myPeerId } = useCurrentPlayer();

  const myTokens = me?.tokens ?? 0;
  const isBuzzer = buzzerId != null && buzzerId === myPeerId;
  const buzzerName = buzzerId
    ? players.find((p) => p.id === buzzerId)?.name ?? null
    : null;
  const buzzEnabled = settings.rules?.buzz?.enabled ?? true;

  const handleBuzz = useCallback(() => {
    dispatch({ type: "hitster-buzz" });
    haptics.medium();
  }, []);

  return (
    <View style={styles.container}>
      {isMyTurn ? (
        <Text style={styles.turnText}>
          Song placed! Waiting for challenges...
        </Text>
      ) : (
        <Text style={styles.turnTextOther}>
          {currentPlayer?.name ?? "Someone"} placed a song. Hitster?
        </Text>
      )}

      {/* Guess result — shown after placing */}
      {guessResult && isMyTurn && (
        <View
          style={[
            styles.guessResultBanner,
            guessResult.titleCorrect && guessResult.artistCorrect
              ? styles.guessResultSuccess
              : styles.guessResultPartial,
          ]}
          accessibilityRole="alert"
        >
          <Text style={styles.guessResultText}>
            {guessResult.titleCorrect ? "✓ Title" : "✗ Title"}
            {"  "}
            {guessResult.artistCorrect ? "✓ Artist" : "✗ Artist"}
            {guessResult.titleCorrect && guessResult.artistCorrect ? "  +1★" : ""}
          </Text>
        </View>
      )}

      <NowPlaying error={playbackError} />

      {/* Show active player's timeline to non-active players (year hidden) */}
      {!isMyTurn && currentPlayerId && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {currentPlayer?.name ?? "Player"}'s Timeline
          </Text>
          <Timeline
            cards={timelines[currentPlayerId] ?? []}
            interactive={false}
            selectedGap={null}
            onGapSelect={() => {}}
            hiddenYearSongId={currentSongId ?? undefined}
          />
        </View>
      )}

      {/* Buzz button — only non-active, non-buzzer players */}
      {!isMyTurn && !isBuzzer && buzzEnabled && !buzzerId && (
        <BuzzerButton
          onPress={handleBuzz}
          disabled={myTokens <= 0}
          buzzerName={null}
        />
      )}

      {/* Show who buzzed */}
      {buzzerName && !isBuzzer && (
        <BuzzerButton onPress={() => {}} disabled buzzerName={buzzerName} />
      )}

      {/* Buzzer places in their timeline */}
      {isBuzzer && (
        <>
          <Text style={styles.turnText}>
            You buzzed! Place the song in your timeline.
          </Text>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Timeline</Text>
            <Timeline
              cards={myTimeline}
              interactive
              selectedGap={buzzGap}
              onGapSelect={onBuzzGapSelect}
            />
          </View>
        </>
      )}

      {/* Active player sees their own timeline (year hidden for placed song) */}
      {isMyTurn && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Timeline</Text>
          <Timeline
            cards={myTimeline}
            interactive={false}
            selectedGap={null}
            onGapSelect={() => {}}
            hiddenYearSongId={currentSongId ?? undefined}
          />
        </View>
      )}

      <AllPlayerTimelines hideCurrentYear />

      <PlayedSongs songs={playedSongs} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: SPACE["2xl"],
    width: "100%",
  },
  section: {
    width: "100%",
    gap: SPACE.sm,
  },
  sectionTitle: {
    ...LABEL_STYLE,
    marginBottom: SPACE.xs,
  },
  turnText: {
    fontSize: FONT.size.xl,
    fontWeight: FONT.weight.bold,
    color: COLORS.accent,
    textAlign: "center",
  },
  turnTextOther: {
    fontSize: FONT.size.xl,
    color: COLORS.textPrimary,
    textAlign: "center",
  },
  guessResultBanner: {
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.md,
    width: "100%",
    alignItems: "center",
  },
  guessResultSuccess: {
    backgroundColor: COLORS.successLight,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  guessResultPartial: {
    backgroundColor: COLORS.warningLight,
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  guessResultText: {
    fontSize: FONT.size.md,
    fontWeight: FONT.weight.semibold,
    color: COLORS.textPrimary,
  },
});
