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
import { AllPlayerTimelines } from "@/components/game/AllPlayerTimelines";
import { COLORS, FONT, SPACE, LABEL_STYLE } from "@/utils/constants";

interface PlayingViewProps {
  selectedGap: number | null;
  onGapSelect: (position: number) => void;
}

export function PlayingView({ selectedGap, onGapSelect }: PlayingViewProps) {
  const playedSongs = useGameStore((s) => s.playedSongs);
  const currentSongId = useGameStore((s) => s.currentSongId);
  const playbackError = useStreamingStore((s) => s.playbackError);
  const { isMyTurn, myTimeline, currentPlayer, me } = useCurrentPlayer();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 768;
  const myTokens = me?.tokens ?? 0;

  const [guessSubmitted, setGuessSubmitted] = useState(false);

  // New song (next round or skip) — allow guessing again
  useEffect(() => {
    setGuessSubmitted(false);
  }, [currentSongId]);

  const handleGuess = useCallback((title: string, artist: string) => {
    dispatch({ type: "guess-song", payload: { title, artist } });
    setGuessSubmitted(true);
  }, []);

  const handleSkipSong = useCallback(() => {
    dispatch({ type: "skip-song" });
    haptics.tap();
  }, []);

  const skipButton = myTokens > 0 && (
    <Button
      title={`Skip Song (costs 1★)`}
      onPress={handleSkipSong}
      variant="ghost"
      label="Skip this song, costs one star token"
    />
  );

  return (
    <View style={styles.container}>
      {isMyTurn ? (
        <Text style={styles.turnText}>
          Your turn! Guess the song, then place it.
        </Text>
      ) : (
        <Text style={styles.turnTextOther}>
          {currentPlayer?.name ?? "Someone"} is guessing & placing...
        </Text>
      )}

      <NowPlaying error={playbackError} />

      {/* Desktop: guess + timeline side by side */}
      {isMyTurn && isWide ? (
        <View style={styles.splitRow}>
          <View style={styles.splitLeft}>
            {!guessSubmitted ? (
              <GuessForm onSubmit={handleGuess} disabled={false} />
            ) : (
              <Text style={styles.guessSubmitted}>
                Guess submitted! Now place the song.
              </Text>
            )}
            {skipButton}
          </View>
          <View style={styles.splitRight}>
            <Text style={styles.sectionTitle}>Your Timeline</Text>
            <Timeline
              cards={myTimeline}
              interactive
              selectedGap={selectedGap}
              onGapSelect={onGapSelect}
            />
          </View>
        </View>
      ) : (
        <>
          {/* Mobile: stacked layout */}
          {isMyTurn && !guessSubmitted && (
            <GuessForm onSubmit={handleGuess} disabled={false} />
          )}
          {isMyTurn && guessSubmitted && (
            <Text style={styles.guessSubmitted}>
              Guess submitted! Now place the song.
            </Text>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Timeline</Text>
            <Timeline
              cards={myTimeline}
              interactive={isMyTurn}
              selectedGap={isMyTurn ? selectedGap : null}
              onGapSelect={isMyTurn ? onGapSelect : () => {}}
            />
          </View>

          {isMyTurn && skipButton}
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
  guessSubmitted: {
    fontSize: FONT.size.base,
    color: COLORS.textSecondary,
    textAlign: "center",
    fontStyle: "italic",
  },
  splitRow: {
    flexDirection: "row",
    gap: SPACE["2xl"],
    width: "100%",
  },
  splitLeft: {
    flex: 1,
    gap: SPACE.lg,
  },
  splitRight: {
    flex: 1,
    gap: SPACE.sm,
  },
});
