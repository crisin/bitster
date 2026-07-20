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
import { Stage } from "@/components/game/Stage";
import { AllPlayerTimelines } from "@/components/game/AllPlayerTimelines";
import { COLORS, FONT, RADIUS, SPACE } from "@/utils/constants";

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

  const activeTimeline = isMyTurn ? myTimeline : (timelines[currentPlayerId ?? ""] ?? []);
  const stageTitle = isMyTurn
    ? "Placed! Survive the challenge…"
    : `${currentPlayer?.name ?? "???"} placed the card`;

  return (
    <View style={styles.container}>
      {/* Guess feedback for the active player */}
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

      {/* The mystery card sits in the active player's timeline, year hidden */}
      <Stage title={stageTitle} hot={isMyTurn}>
        <NowPlaying error={playbackError} />
        <Timeline
          cards={activeTimeline}
          interactive={false}
          selectedGap={null}
          onGapSelect={() => {}}
          hiddenYearSongId={currentSongId}
        />
      </Stage>

      {/* Challenge — non-active players who haven't buzzed */}
      {!isMyTurn && !isBuzzer && buzzEnabled && !buzzerId && (
        <View style={styles.buzzSection}>
          <Text style={styles.buzzHint}>Think it's in the wrong spot?</Text>
          <BuzzerButton onPress={handleBuzz} disabled={myTokens <= 0} buzzerName={null} />
        </View>
      )}

      {/* Someone else buzzed */}
      {buzzerName && !isBuzzer && (
        <BuzzerButton onPress={() => {}} disabled buzzerName={buzzerName} />
      )}

      {/* I buzzed — place the song in MY timeline */}
      {isBuzzer && (
        <Stage title="Your counter-move" hot>
          <Text style={styles.buzzPlaceHint}>
            Place the mystery song where YOU think it belongs
          </Text>
          <Timeline
            cards={myTimeline}
            interactive
            selectedGap={buzzGap}
            onGapSelect={onBuzzGapSelect}
          />
        </Stage>
      )}

      <AllPlayerTimelines hideCurrentYear />

      <PlayedSongs songs={playedSongs} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: SPACE.xl,
    width: "100%",
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
  buzzSection: {
    alignItems: "center",
    gap: SPACE.xs,
  },
  buzzHint: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
  },
  buzzPlaceHint: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingHorizontal: SPACE.lg,
  },
});
