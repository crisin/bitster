import { AllPlayerTimelines } from "@/components/game/AllPlayerTimelines";
import { BuzzerButton } from "@/components/game/BuzzerButton";
import { NowPlaying } from "@/components/game/NowPlaying";
import { PlayedSongs } from "@/components/game/PlayedSongs";
import { Stage } from "@/components/game/Stage";
import { Timeline } from "@/components/game/Timeline";
import { Button } from "@/components/ui/Button";
import { useGameStore } from "@/game/store";
import { useCurrentPlayer } from "@/hooks/useCurrentPlayer";
import { haptics } from "@/hooks/useHaptics";
import { dispatch } from "@/p2p/connection";
import { useStreamingStore } from "@/streaming/store";
import { createThemedStyles } from "@/theme/themedStyles";
import { DISPLAY_FONT, FONT, RADIUS, SPACE } from "@/utils/constants";
import React, { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";

interface BitsterWindowViewProps {
  buzzGap: number | null;
  onBuzzGapSelect: (position: number) => void;
}

/** Seconds left until the buzz deadline, ticking 4×/s for a smooth countdown */
function useBuzzCountdown(deadline: number | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (deadline == null) {
      setRemaining(null);
      return;
    }
    const tick = () => {
      setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [deadline]);

  return remaining;
}

function BuzzCountdown({ deadline }: { deadline: number | null }) {
  const styles = useStyles();
  const remaining = useBuzzCountdown(deadline);
  if (remaining == null) return null;

  const urgent = remaining <= 5;
  return (
    <View
      style={[styles.countdown, urgent && styles.countdownUrgent]}
      accessibilityRole="timer"
      accessibilityLabel={`${remaining} seconds left to place`}
    >
      <Text
        style={[styles.countdownText, urgent && styles.countdownTextUrgent]}
      >
        {remaining}s
      </Text>
    </View>
  );
}

export function BitsterWindowView({
  buzzGap,
  onBuzzGapSelect,
}: BitsterWindowViewProps) {
  const styles = useStyles();
  const players = useGameStore((s) => s.players);
  const buzzerId = useGameStore((s) => s.buzzerId);
  const buzzDeadline = useGameStore((s) => s.buzzDeadline);
  const passedIds = useGameStore((s) => s.passedIds);
  const settings = useGameStore((s) => s.settings);
  const timelines = useGameStore((s) => s.timelines);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const currentSongId = useGameStore((s) => s.currentSongId);
  const playedSongs = useGameStore((s) => s.playedSongs);
  const guessResult = useGameStore((s) => s.guessResult);
  const playbackError = useStreamingStore((s) => s.playbackError);
  const {
    isMyTurn,
    isHost,
    currentPlayer,
    me,
    myPeerId,
    actsForCurrent,
    isBuzzer,
    controlsBuzzer,
  } = useCurrentPlayer();

  const myTokens = me?.tokens ?? 0;
  const hasPassed = myPeerId != null && passedIds.includes(myPeerId);
  const buzzerName = buzzerId
    ? (players.find((p) => p.id === buzzerId)?.name ?? null)
    : null;
  const buzzEnabled = settings.rules?.buzz?.enabled ?? true;

  const handleBuzz = useCallback(() => {
    dispatch({ type: "bitster-buzz" });
    haptics.medium();
  }, []);

  const handlePass = useCallback(() => {
    dispatch({ type: "bitster-pass" });
    haptics.tap();
  }, []);

  // Pass-and-play: the host device buzzes/passes on behalf of its local players
  const handleLocalBuzz = useCallback((playerId: string) => {
    dispatch({ type: "bitster-buzz" }, { as: playerId });
    haptics.medium();
  }, []);

  const handleLocalPass = useCallback((playerId: string) => {
    dispatch({ type: "bitster-pass" }, { as: playerId });
    haptics.tap();
  }, []);

  const localChallengers = isHost
    ? players.filter(
        (p) =>
          p.isLocal && p.id !== currentPlayerId && !passedIds.includes(p.id),
      )
    : [];

  const activeTimeline = timelines[currentPlayerId ?? ""] ?? [];
  // The buzzer corrects the ACTIVE player's timeline — gaps are between the
  // other cards, so the disputed mystery card is taken out for placement
  const challengeTimeline = activeTimeline.filter(
    (s) => s.id !== currentSongId,
  );
  const stageTitle = isMyTurn
    ? "Placed! Survive the challenge…"
    : `${currentPlayer?.name ?? "???"} placed the card`;

  return (
    <View style={styles.container}>
      {/* Guess feedback for the active player('s device) */}
      {guessResult && actsForCurrent && (
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
            {guessResult.titleCorrect && guessResult.artistCorrect
              ? "  +1★"
              : ""}
          </Text>
        </View>
      )}

      {/* The mystery card sits in the active player's timeline, year hidden */}
      <Stage title={stageTitle} hot={actsForCurrent}>
        <NowPlaying error={playbackError} />
        <Timeline
          cards={activeTimeline}
          interactive={false}
          selectedGap={null}
          onGapSelect={() => {}}
          hiddenYearSongId={currentSongId}
        />
      </Stage>

      {/* Challenge — non-active players who haven't buzzed or passed */}
      {!isMyTurn && !isBuzzer && !hasPassed && buzzEnabled && !buzzerId && (
        <View style={styles.buzzSection}>
          <Text style={styles.buzzHint}>Think it's in the wrong spot?</Text>
          <BuzzerButton
            onPress={handleBuzz}
            disabled={myTokens <= 0}
            buzzerName={null}
          />
          {myTokens > 0 && (
            <Button
              title="No bitster ✋"
              onPress={handlePass}
              variant="ghost"
              compact
              cooldownMs={1000}
              label="Pass — I won't challenge this placement"
            />
          )}
        </View>
      )}

      {/* Local pass-and-play challengers on this (host) device */}
      {localChallengers.length > 0 && buzzEnabled && !buzzerId && (
        <View style={styles.localBuzzSection}>
          <Text style={styles.buzzHint}>Local players — challenge?</Text>
          {localChallengers.map((p) => (
            <View key={p.id} style={styles.localBuzzRow}>
              <Text style={styles.localBuzzName} numberOfLines={1}>
                {p.name}
              </Text>
              <Button
                title="bitster! 1★"
                onPress={() => handleLocalBuzz(p.id)}
                variant="warning"
                compact
                disabled={p.tokens <= 0}
                label={`${p.name} buzzes bitster, costs one star`}
              />
              <Button
                title="✋ pass"
                onPress={() => handleLocalPass(p.id)}
                variant="ghost"
                compact
                cooldownMs={1000}
                label={`${p.name} passes`}
              />
            </View>
          ))}
        </View>
      )}

      {/* I passed — waiting for the rest */}
      {!isMyTurn && hasPassed && !buzzerId && (
        <Text style={styles.passedHint}>
          ✋ No bitster — waiting for the others…
        </Text>
      )}

      {/* Someone else buzzed (and this device doesn't control them) */}
      {buzzerName && !controlsBuzzer && (
        <View style={styles.buzzSection}>
          <BuzzerButton onPress={() => {}} disabled buzzerName={buzzerName} />
          <BuzzCountdown deadline={buzzDeadline} />
          <Text style={styles.buzzHint}>
            {buzzerName} is placing the card — hang tight!
          </Text>
        </View>
      )}

      {/* This device holds the buzz (me, or a local player on the host device) */}
      {controlsBuzzer && (
        <Stage
          title={
            isBuzzer
              ? "Your counter-move"
              : `${buzzerName ?? "???"}'s counter-move`
          }
          hot
        >
          <BuzzCountdown deadline={buzzDeadline} />
          <Text style={styles.buzzPlaceHint}>
            Tap the gap in {currentPlayer ? `${currentPlayer.name}'s` : "the"}{" "}
            timeline where the song REALLY belongs.{" "}
            {isBuzzer
              ? "If you're right, the card is yours!"
              : "Right = the card goes to them!"}
          </Text>
          <Timeline
            cards={challengeTimeline}
            interactive
            selectedGap={buzzGap}
            onGapSelect={onBuzzGapSelect}
          />
        </Stage>
      )}

      {/* Who's still thinking about a challenge? */}
      <ChallengerStatus
        players={players}
        currentPlayerId={currentPlayerId}
        buzzerId={buzzerId}
        passedIds={passedIds}
      />

      <AllPlayerTimelines hideCurrentYear />

      <PlayedSongs songs={playedSongs} />
    </View>
  );
}

interface ChallengerStatusProps {
  players: { id: string; name: string; tokens: number }[];
  currentPlayerId: string | null;
  buzzerId: string | null;
  passedIds: string[];
}

/** One chip per non-active player: buzzed, passed, broke, or still thinking */
function ChallengerStatus({
  players,
  currentPlayerId,
  buzzerId,
  passedIds,
}: ChallengerStatusProps) {
  const styles = useStyles();
  const challengers = players.filter((p) => p.id !== currentPlayerId);
  if (challengers.length === 0) return null;

  return (
    <View style={styles.statusRow}>
      {challengers.map((p) => {
        let status: string;
        let statusStyle: StyleProp<TextStyle> = styles.statusThinking;
        if (p.id === buzzerId) {
          status = "⚡ bitster!";
          statusStyle = styles.statusBuzzed;
        } else if (passedIds.includes(p.id)) {
          status = "✋ no bitster";
          statusStyle = styles.statusPassed;
        } else if (p.tokens <= 0) {
          status = "no ★ left";
          statusStyle = styles.statusPassed;
        } else {
          status = "thinking…";
        }
        return (
          <View
            key={p.id}
            style={styles.statusChip}
            accessibilityRole="text"
            accessibilityLabel={`${p.name}: ${status}`}
          >
            <Text style={styles.statusName} numberOfLines={1}>
              {p.name}
            </Text>
            <Text style={[styles.statusText, statusStyle]}>{status}</Text>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) =>
  StyleSheet.create({
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
      gap: SPACE.sm,
    },
    localBuzzSection: {
      width: "100%",
      alignItems: "center",
      gap: SPACE.sm,
    },
    localBuzzRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.sm,
      width: "100%",
      maxWidth: 420,
    },
    localBuzzName: {
      flex: 1,
      fontSize: FONT.size.base,
      fontWeight: FONT.weight.semibold,
      color: COLORS.textPrimary,
    },
    buzzHint: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
    },
    passedHint: {
      fontSize: FONT.size.base,
      color: COLORS.textSecondary,
      fontStyle: "italic",
    },
    buzzPlaceHint: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
      textAlign: "center",
      paddingHorizontal: SPACE.lg,
    },
    countdown: {
      alignSelf: "center",
      paddingVertical: SPACE.xs,
      paddingHorizontal: SPACE.lg,
      borderRadius: RADIUS.full,
      borderWidth: 2,
      borderColor: COLORS.warning,
      backgroundColor: COLORS.warningLight,
    },
    countdownUrgent: {
      borderColor: COLORS.error,
      backgroundColor: COLORS.errorLight,
    },
    countdownText: {
      fontFamily: DISPLAY_FONT,
      fontSize: FONT.size["3xl"],
      color: COLORS.warning,
      letterSpacing: 1,
    },
    countdownTextUrgent: {
      color: COLORS.error,
    },
    statusRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: SPACE.sm,
      width: "100%",
    },
    statusChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.sm,
      paddingVertical: SPACE.xs,
      paddingHorizontal: SPACE.md,
      borderRadius: RADIUS.full,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgCard,
      maxWidth: 220,
    },
    statusName: {
      fontSize: FONT.size.sm,
      fontWeight: FONT.weight.semibold,
      color: COLORS.textPrimary,
      flexShrink: 1,
    },
    statusText: {
      fontSize: FONT.size.sm,
    },
    statusThinking: {
      color: COLORS.textSecondary,
    },
    statusPassed: {
      color: COLORS.textSecondary,
      opacity: 0.8,
    },
    statusBuzzed: {
      color: COLORS.warning,
      fontWeight: FONT.weight.bold,
    },
  }),
);
