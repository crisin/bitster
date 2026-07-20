import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, useWindowDimensions } from "react-native";
import { useGameStore } from "@/game/store";
import { useStreamingStore } from "@/streaming/store";
import { useCurrentPlayer } from "@/hooks/useCurrentPlayer";
import { dispatch } from "@/p2p/connection";
import { haptics } from "@/hooks/useHaptics";
import { Button } from "@/components/ui/Button";
import { Timeline } from "@/components/game/Timeline";
import { NowPlaying } from "@/components/game/NowPlaying";
import { GuessForm } from "@/components/game/GuessForm";
import { PlayedSongs } from "@/components/game/PlayedSongs";
import { Stage } from "@/components/game/Stage";
import { AllPlayerTimelines } from "@/components/game/AllPlayerTimelines";
import { COLORS, FONT, SPACE } from "@/utils/constants";

interface PlayingViewProps {
  selectedGap: number | null;
  onGapSelect: (position: number) => void;
}

export function PlayingView({ selectedGap, onGapSelect }: PlayingViewProps) {
  const playedSongs = useGameStore((s) => s.playedSongs);
  const currentSongId = useGameStore((s) => s.currentSongId);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const timelines = useGameStore((s) => s.timelines);
  const playbackError = useStreamingStore((s) => s.playbackError);
  const { isMyTurn, currentPlayer, actsForCurrent, actingId } = useCurrentPlayer();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 900;
  // Tokens of whoever is placing — with pass-and-play that can be a local
  // player on this device, not "me"
  const actingTokens = actsForCurrent ? currentPlayer?.tokens ?? 0 : 0;

  const [guessSubmitted, setGuessSubmitted] = useState(false);

  // New song (next round or skip) — allow guessing again
  useEffect(() => {
    setGuessSubmitted(false);
  }, [currentSongId]);

  const handleGuess = useCallback(
    (title: string, artist: string) => {
      if (actingId == null) return;
      dispatch({ type: "guess-song", payload: { title, artist } }, { as: actingId });
      setGuessSubmitted(true);
    },
    [actingId],
  );

  const handleSkipSong = useCallback(() => {
    if (actingId == null) return;
    dispatch({ type: "skip-song" }, { as: actingId });
    haptics.tap();
  }, [actingId]);

  // The stage always shows the ACTIVE player's timeline — that's what
  // everyone needs to see to follow the round (and plan a Hitster!)
  const stageTimeline = timelines[currentPlayerId ?? ""] ?? [];
  const stageTitle = isMyTurn
    ? "You're on stage"
    : actsForCurrent
      ? `${currentPlayer?.name ?? "???"} is on stage — this device!`
      : `${currentPlayer?.name ?? "???"} is on stage`;

  const stage = (
    <Stage title={stageTitle} hot={actsForCurrent}>
      <NowPlaying error={playbackError} />
      <Timeline
        cards={stageTimeline}
        interactive={actsForCurrent}
        selectedGap={actsForCurrent ? selectedGap : null}
        onGapSelect={actsForCurrent ? onGapSelect : () => {}}
      />
      {!actsForCurrent && (
        <Text style={styles.watchHint}>
          Listen along — know where it belongs? Get ready to HITSTER!
        </Text>
      )}
    </Stage>
  );

  const guessPanel = actsForCurrent && (
    <View style={styles.guessPanel}>
      {!guessSubmitted ? (
        <GuessForm key={`${currentSongId}-${actingId}`} onSubmit={handleGuess} disabled={false} />
      ) : (
        <Text style={styles.guessSubmitted}>
          Guess locked in! Now place the song in the timeline.
        </Text>
      )}
      {actingTokens > 0 && (
        <Button
          title={`Skip Song (costs 1★)`}
          onPress={handleSkipSong}
          variant="ghost"
          cooldownMs={2000}
          label="Skip this song, costs one star token"
        />
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {actsForCurrent && isWide ? (
        <View style={styles.splitRow}>
          <View style={styles.splitLeft}>{guessPanel}</View>
          <View style={styles.splitRight}>{stage}</View>
        </View>
      ) : (
        <>
          {stage}
          {guessPanel}
        </>
      )}

      <AllPlayerTimelines />

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
  watchHint: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingHorizontal: SPACE.lg,
  },
  guessPanel: {
    width: "100%",
    gap: SPACE.lg,
  },
  guessSubmitted: {
    fontSize: FONT.size.base,
    color: COLORS.textSecondary,
    textAlign: "center",
    fontStyle: "italic",
    paddingVertical: SPACE.md,
  },
  splitRow: {
    flexDirection: "row",
    gap: SPACE.xl,
    width: "100%",
    alignItems: "flex-start",
  },
  splitLeft: {
    width: 320,
    gap: SPACE.lg,
  },
  splitRight: {
    flex: 1,
    minWidth: 0,
  },
});
