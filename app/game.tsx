import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useGameStore } from "@/game/store";
import { useCurrentPlayer } from "@/hooks/useCurrentPlayer";
import { useConnectionStatus } from "@/hooks/useConnectionStatus";
import { dispatch, leave, rejoinRoom } from "@/p2p/connection";
import { useP2PStore } from "@/p2p/store";
import { StatusDot } from "@/components/ui/StatusDot";
import { Button } from "@/components/ui/Button";
import { BottomBar } from "@/components/ui/BottomBar";
import { Pressable } from "@/components/ui/Pressable";
import { Timeline } from "@/components/game/Timeline";
import { PlayerList } from "@/components/game/PlayerList";
import { RevealCard } from "@/components/game/RevealCard";
import { NowPlaying } from "@/components/game/NowPlaying";
import { ScoreBoard } from "@/components/game/ScoreBoard";
import { PlayedSongs } from "@/components/game/PlayedSongs";
import { BuzzerButton } from "@/components/game/BuzzerButton";
import { PlayerTimeline } from "@/components/game/PlayerTimeline";
import { GuessForm } from "@/components/game/GuessForm";
import { RoomCode } from "@/components/lobby/RoomCode";
import { PlayerSlot } from "@/components/lobby/PlayerSlot";
import { GameSettings } from "@/components/lobby/GameSettings";
import { DeviceSelector } from "@/components/streaming/DeviceSelector";
import { Input } from "@/components/ui/Input";
import { haptics } from "@/hooks/useHaptics";
import {
  COLORS,
  FONT,
  RADIUS,
  SPACE,
  LAYOUT,
  LABEL_STYLE,
} from "@/utils/constants";

export default function GameScreen() {
  const params = useLocalSearchParams<{
    code: string;
    host: string;
    name: string;
  }>();

  const phase = useGameStore((s) => s.phase);
  const players = useGameStore((s) => s.players);
  const lastResult = useGameStore((s) => s.lastResult);
  const hostId = useGameStore((s) => s.hostId);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const playedSongs = useGameStore((s) => s.playedSongs);
  const buzzerId = useGameStore((s) => s.buzzerId);
  const settings = useGameStore((s) => s.settings);
  const timelines = useGameStore((s) => s.timelines);
  const failedTimelines = useGameStore((s) => s.failedTimelines);
  const playlistName = useGameStore((s) => s.playlistName);
  const currentSongId = useGameStore((s) => s.currentSongId);
  const guessResult = useGameStore((s) => s.guessResult);
  const connectionStatus = useConnectionStatus();
  const connectionError = useP2PStore((s) => s.lastError);
  const { isMyTurn, isHost, myTimeline, currentPlayer, myPeerId } =
    useCurrentPlayer();

  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 768;
  const myTokens = players.find((p) => p.id === myPeerId)?.tokens ?? 0;

  const [playlistUrl, setPlaylistUrl] = useState("");
  const [selectedGap, setSelectedGap] = useState<number | null>(null);
  const [buzzGap, setBuzzGap] = useState<number | null>(null);
  const [guessSubmitted, setGuessSubmitted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const isBuzzer = buzzerId === myPeerId;
  const buzzerName = buzzerId
    ? players.find((p) => p.id === buzzerId)?.name ?? null
    : null;
  const buzzEnabled = settings.rules?.buzz?.enabled ?? true;

  useEffect(() => {
    return () => {
      leave();
    };
  }, []);

  useEffect(() => {
    if (lastResult) {
      lastResult.correct ? haptics.success() : haptics.error();
    }
  }, [lastResult]);

  useEffect(() => {
    setBuzzGap(null);
  }, [buzzerId]);

  // Reset guess state when a new round starts
  useEffect(() => {
    if (phase === "playing") {
      setGuessSubmitted(false);
    }
  }, [phase]);

  // In-game errors from the host ("Not your turn", ...) show as a brief toast;
  // fatal errors keep using the banner below via connectionStatus === "error"
  useEffect(() => {
    if (connectionError && connectionStatus === "connected") {
      setToast(connectionError);
      useP2PStore.getState().setLastError(null);
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [connectionError, connectionStatus]);

  const handleGapSelect = useCallback((position: number) => {
    setSelectedGap(position);
    haptics.tap();
  }, []);

  const handleConfirmPlacement = useCallback(() => {
    if (selectedGap === null) return;
    dispatch({ type: "place-song", payload: { position: selectedGap } });
    setSelectedGap(null);
    haptics.medium();
  }, [selectedGap]);

  const handleNextRound = useCallback(() => {
    dispatch({ type: "next-round" });
  }, []);

  const handleStartGame = useCallback(() => {
    dispatch({
      type: "start-game",
      payload: { playlistUrl: playlistUrl.trim() },
    });
  }, [playlistUrl]);

  const handleGoHome = useCallback(() => {
    leave();
    router.replace("/");
  }, []);

  const handleRematch = useCallback(() => {
    dispatch({ type: "rematch" });
  }, []);

  const handleBuzz = useCallback(() => {
    dispatch({ type: "hitster-buzz" });
    haptics.medium();
  }, []);

  const handleBuzzGapSelect = useCallback((position: number) => {
    setBuzzGap(position);
    haptics.tap();
  }, []);

  const handleConfirmBuzzPlacement = useCallback(() => {
    if (buzzGap === null) return;
    dispatch({ type: "buzz-place", payload: { position: buzzGap } });
    setBuzzGap(null);
    haptics.medium();
  }, [buzzGap]);

  const handleSkipSong = useCallback(() => {
    dispatch({ type: "skip-song" });
    haptics.tap();
  }, []);

  const handleGuess = useCallback((title: string, artist: string) => {
    dispatch({ type: "guess-song", payload: { title, artist } });
    setGuessSubmitted(true);
  }, []);

  const handleReveal = useCallback(() => {
    dispatch({ type: "reveal-song" });
  }, []);

  const code = params.code ?? "";

  const handleRetry = useCallback(() => {
    // Without a name we can never complete the join handshake — start over
    if (!params.name || !code) {
      leave();
      router.replace("/");
      return;
    }
    rejoinRoom(code, params.name);
  }, [code, params.name]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>HITSTER</Text>
        <View style={styles.headerRight}>
          <Text style={styles.headerCode}>{code}</Text>
          <StatusDot status={connectionStatus} />
        </View>
      </View>

      {/* Connection error banner */}
      {connectionStatus === "error" && connectionError && (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Text style={styles.errorBannerText}>{connectionError}</Text>
          <View style={styles.errorButtons}>
            <Button
              title="Retry"
              onPress={handleRetry}
              variant="secondary"
              compact
              label="Retry connection"
            />
            <Button
              title="Home"
              onPress={handleGoHome}
              variant="ghost"
              compact
              label="Go back to home screen"
            />
          </View>
        </View>
      )}

      {/* Connecting indicator */}
      {connectionStatus === "connecting" && (
        <View style={styles.connectingBanner}>
          <Text style={styles.connectingText}>Connecting to room...</Text>
        </View>
      )}

      {/* Transient in-game error toast */}
      {toast && (
        <View style={styles.toast} accessibilityRole="alert">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      {/* Playlist name banner */}
      {playlistName && phase !== "lobby" && (
        <View style={styles.playlistBanner}>
          <Text style={styles.playlistName} numberOfLines={1}>
            ♫ {playlistName}
          </Text>
        </View>
      )}

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
      >
        {/* LOBBY */}
        {phase === "lobby" && (
          <View style={styles.phaseContainer}>
            <RoomCode code={code} />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Players ({players.length})
              </Text>
              {players.map((p) => (
                <PlayerSlot
                  key={p.id}
                  name={p.name}
                  isHost={p.id === hostId}
                  connectionStatus="connected"
                />
              ))}
              {players.length === 0 && (
                <Text style={styles.hint}>Waiting for players...</Text>
              )}
            </View>

            <DeviceSelector />

            {isHost && (
              <>
                <View style={styles.section}>
                  <Input
                    placeholder="Spotify playlist URL"
                    label="Enter Spotify playlist URL"
                    value={playlistUrl}
                    onChangeText={setPlaylistUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="go"
                    onSubmitEditing={handleStartGame}
                  />
                </View>
                <GameSettings />
              </>
            )}

            {!isHost && (
              <Text style={styles.hint}>Waiting for host to start...</Text>
            )}

            <Pressable
              onPress={handleGoHome}
              label="Leave lobby"
              style={styles.leaveBtn}
            >
              <Text style={styles.leaveLink}>Leave lobby</Text>
            </Pressable>
          </View>
        )}

        {/* PLAYING — active player guesses + places */}
        {phase === "playing" && (
          <View style={styles.phaseContainer}>
            {isMyTurn ? (
              <Text style={styles.turnText}>
                Your turn! Guess the song, then place it.
              </Text>
            ) : (
              <Text style={styles.turnTextOther}>
                {currentPlayer?.name ?? "Someone"} is guessing & placing...
              </Text>
            )}

            <NowPlaying />

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
                  {myTokens > 0 && (
                    <Button
                      title={`Skip Song (costs 1★)`}
                      onPress={handleSkipSong}
                      variant="ghost"
                      label="Skip this song, costs one star token"
                    />
                  )}
                </View>
                <View style={styles.splitRight}>
                  <Text style={styles.sectionTitle}>Your Timeline</Text>
                  <Timeline
                    cards={myTimeline}
                    interactive
                    selectedGap={selectedGap}
                    onGapSelect={handleGapSelect}
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
                    selectedGap={selectedGap}
                    onGapSelect={handleGapSelect}
                  />
                </View>

                {isMyTurn && myTokens > 0 && (
                  <Button
                    title={`Skip Song (costs 1★)`}
                    onPress={handleSkipSong}
                    variant="ghost"
                    label="Skip this song, costs one star token"
                  />
                )}
              </>
            )}

            {/* Non-active player sees their own timeline (non-interactive) */}
            {!isMyTurn && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Your Timeline</Text>
                <Timeline
                  cards={myTimeline}
                  interactive={false}
                  selectedGap={null}
                  onGapSelect={() => {}}
                />
              </View>
            )}

            {/* All player timelines */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>All Players</Text>
              {players.map((p) => (
                <PlayerTimeline
                  key={p.id}
                  name={p.id === myPeerId ? `${p.name} (you)` : p.name}
                  songs={timelines[p.id] ?? []}
                  isCurrent={p.id === currentPlayerId}
                  tokens={p.tokens}
                  failedSongs={failedTimelines[p.id] ?? []}
                />
              ))}
            </View>

            <PlayedSongs songs={playedSongs} />
          </View>
        )}

        {/* HITSTER WINDOW — song placed, year hidden, buzz opportunity */}
        {phase === "hitster-window" && (
          <View style={styles.phaseContainer}>
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
                  {guessResult.titleCorrect && guessResult.artistCorrect
                    ? "  +1★"
                    : ""}
                </Text>
              </View>
            )}

            <NowPlaying />

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
                  hiddenYearSongId={currentSongId}
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
              <BuzzerButton
                onPress={() => {}}
                disabled
                buzzerName={buzzerName}
              />
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
                    onGapSelect={handleBuzzGapSelect}
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
                  hiddenYearSongId={currentSongId}
                />
              </View>
            )}

            {/* All player timelines */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>All Players</Text>
              {players.map((p) => (
                <PlayerTimeline
                  key={p.id}
                  name={p.id === myPeerId ? `${p.name} (you)` : p.name}
                  songs={timelines[p.id] ?? []}
                  isCurrent={p.id === currentPlayerId}
                  tokens={p.tokens}
                  hiddenYearSongId={
                    p.id === currentPlayerId ? currentSongId : undefined
                  }
                  failedSongs={failedTimelines[p.id] ?? []}
                />
              ))}
            </View>

            <PlayedSongs songs={playedSongs} />
          </View>
        )}

        {/* REVEAL — result shown */}
        {phase === "reveal" && lastResult && (
          <View style={styles.phaseContainer}>
            <RevealCard correct={lastResult.correct} song={lastResult.song} />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Your Timeline</Text>
              <Timeline
                cards={myTimeline}
                interactive={false}
                selectedGap={null}
                onGapSelect={() => {}}
              />
            </View>

            {/* All player timelines */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>All Players</Text>
              {players.map((p) => (
                <PlayerTimeline
                  key={p.id}
                  name={p.id === myPeerId ? `${p.name} (you)` : p.name}
                  songs={timelines[p.id] ?? []}
                  isCurrent={p.id === currentPlayerId}
                  tokens={p.tokens}
                  failedSongs={failedTimelines[p.id] ?? []}
                />
              ))}
            </View>
          </View>
        )}

        {/* FINISHED */}
        {phase === "finished" && (
          <View style={styles.phaseContainer}>
            <Text style={styles.gameOverTitle}>Game Over!</Text>
            <ScoreBoard players={players} myId={myPeerId} />
          </View>
        )}
      </ScrollView>

      {/* Bottom Bar */}
      <BottomBar>
        {phase === "lobby" && isHost && (
          <Button
            title="Start Game"
            onPress={handleStartGame}
            disabled={players.length < 2}
            label="Start the game"
          />
        )}

        {phase === "playing" && isMyTurn && selectedGap !== null && (
          <Button
            title="Place Here"
            onPress={handleConfirmPlacement}
            label="Confirm song placement"
          />
        )}

        {phase === "hitster-window" && isBuzzer && buzzGap !== null && (
          <Button
            title="Place Here"
            onPress={handleConfirmBuzzPlacement}
            label="Confirm buzz placement"
          />
        )}

        {phase === "hitster-window" && !isBuzzer && (isMyTurn || isHost) && (
          <Button
            title="Reveal →"
            onPress={handleReveal}
            label="Reveal the song year"
          />
        )}

        {phase === "reveal" && (isMyTurn || isHost) && (
          <Button
            title="Next Round →"
            onPress={handleNextRound}
            label="Start next round"
          />
        )}

        {phase === "finished" && (
          <View style={styles.finishedButtons}>
            <Button
              title="Home"
              onPress={handleGoHome}
              variant="ghost"
              style={styles.flex1}
              label="Return to home screen"
            />
            <Button
              title="Rematch"
              onPress={handleRematch}
              style={styles.flex1}
              label="Start a new game with same players"
            />
          </View>
        )}
      </BottomBar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  header: {
    height: LAYOUT.headerHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACE.xl,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: FONT.size["2xl"],
    fontWeight: FONT.weight.black,
    color: COLORS.accent,
    letterSpacing: FONT.tracking.widest,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
  },
  headerCode: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.bold,
    letterSpacing: FONT.tracking.widest,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.secondary,
    paddingVertical: 2,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.sm,
    overflow: "hidden",
  },
  errorBanner: {
    padding: SPACE.lg,
    backgroundColor: COLORS.errorLight,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.error,
    alignItems: "center",
    gap: SPACE.md,
  },
  errorBannerText: {
    fontSize: FONT.size.base,
    color: COLORS.error,
    textAlign: "center",
    fontWeight: FONT.weight.medium,
  },
  errorButtons: {
    flexDirection: "row",
    gap: SPACE.md,
  },
  connectingBanner: {
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.xl,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.warning,
    backgroundColor: COLORS.warningLight,
    alignItems: "center",
  },
  connectingText: {
    fontSize: FONT.size.base,
    color: COLORS.warning,
    fontWeight: FONT.weight.medium,
  },
  toast: {
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.xl,
    backgroundColor: COLORS.warningLight,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.warning,
    alignItems: "center",
  },
  toastText: {
    fontSize: FONT.size.base,
    color: COLORS.warning,
    fontWeight: FONT.weight.medium,
    textAlign: "center",
  },
  playlistBanner: {
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.xl,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  playlistName: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
    fontWeight: FONT.weight.medium,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: SPACE.xl,
    paddingBottom: SPACE["4xl"],
  },
  phaseContainer: {
    alignItems: "center",
    gap: SPACE["2xl"],
  },
  section: {
    width: "100%",
    gap: SPACE.sm,
  },
  sectionTitle: {
    ...LABEL_STYLE,
    marginBottom: SPACE.xs,
  },
  hint: {
    color: COLORS.textSecondary,
    fontSize: FONT.size.base,
    textAlign: "center",
    paddingVertical: SPACE.sm,
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
  gameOverTitle: {
    fontSize: FONT.size["6xl"],
    fontWeight: FONT.weight.black,
    color: COLORS.textPrimary,
    textAlign: "center",
  },
  guessSubmitted: {
    fontSize: FONT.size.base,
    color: COLORS.textSecondary,
    textAlign: "center",
    fontStyle: "italic",
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
  leaveBtn: {
    minHeight: 36,
    minWidth: 36,
  },
  leaveLink: {
    fontSize: FONT.size.base,
    color: COLORS.textSecondary,
    opacity: 0.6,
    marginTop: SPACE.sm,
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
  finishedButtons: {
    flexDirection: "row",
    gap: SPACE.md,
  },
  flex1: {
    flex: 1,
  },
});
