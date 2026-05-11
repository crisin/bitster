import React, { useState, useCallback, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useGameStore } from "@/game/store";
import { useCurrentPlayer } from "@/hooks/useCurrentPlayer";
import { useConnectionStatus } from "@/hooks/useConnectionStatus";
import { dispatch, leave } from "@/p2p/connection";
import { StatusDot } from "@/components/ui/StatusDot";
import { Button } from "@/components/ui/Button";
import { BottomBar } from "@/components/ui/BottomBar";
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
import { COLORS, SIZES } from "@/utils/constants";

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
  const playlistName = useGameStore((s) => s.playlistName);
  const connectionStatus = useConnectionStatus();
  const { isMyTurn, isHost, myTimeline, currentPlayer, myPeerId } =
    useCurrentPlayer();

  const myTokens = players.find((p) => p.id === myPeerId)?.tokens ?? 0;

  const [playlistUrl, setPlaylistUrl] = useState("");
  const [selectedGap, setSelectedGap] = useState<number | null>(null);
  const [buzzGap, setBuzzGap] = useState<number | null>(null);
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
    dispatch({ type: "start-game", payload: { playlistUrl: playlistUrl.trim() } });
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
  }, []);

  const code = params.code ?? "";

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

      {/* Playlist name banner */}
      {playlistName && phase !== "lobby" && (
        <View style={styles.playlistBanner}>
          <Text style={styles.playlistName} numberOfLines={1}>♫ {playlistName}</Text>
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

            <TouchableOpacity onPress={handleGoHome} activeOpacity={0.6}>
              <Text style={styles.leaveLink}>Leave lobby</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* PLAYING */}
        {phase === "playing" && (
          <View style={styles.phaseContainer}>
            {isBuzzer ? (
              <Text style={styles.turnText}>
                You buzzed! Place the song in your timeline.
              </Text>
            ) : isMyTurn ? (
              <Text style={styles.turnText}>
                Your turn! Place the song in your timeline.
              </Text>
            ) : (
              <Text style={styles.turnTextOther}>
                {currentPlayer?.name ?? "Someone"} is placing a song...
              </Text>
            )}

            <NowPlaying />

            {/* My timeline (interactive if my turn or I buzzed) */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Your Timeline</Text>
              {isBuzzer ? (
                <Timeline
                  cards={myTimeline}
                  interactive
                  selectedGap={buzzGap}
                  onGapSelect={handleBuzzGapSelect}
                />
              ) : (
                <Timeline
                  cards={myTimeline}
                  interactive={isMyTurn}
                  selectedGap={selectedGap}
                  onGapSelect={handleGapSelect}
                />
              )}
            </View>

            {/* Skip button for active player */}
            {isMyTurn && !isBuzzer && myTokens > 0 && (
              <Button
                title={`Skip Song (costs 1★)`}
                onPress={handleSkipSong}
                variant="ghost"
              />
            )}

            {/* Buzzer for non-active players */}
            {!isMyTurn && !isBuzzer && buzzEnabled && (
              <BuzzerButton
                onPress={handleBuzz}
                disabled={!!buzzerId || myTokens <= 0}
                buzzerName={buzzerName}
              />
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
                />
              ))}
            </View>

            <PlayedSongs songs={playedSongs} />
          </View>
        )}

        {/* REVEAL */}
        {phase === "reveal" && lastResult && (
          <View style={styles.phaseContainer}>
            <RevealCard correct={lastResult.correct} song={lastResult.song} />

            <Timeline
              cards={myTimeline}
              interactive={false}
              selectedGap={null}
              onGapSelect={() => {}}
            />

            <GuessForm
              onSubmit={handleGuess}
              disabled={false}
            />
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
          />
        )}

        {phase === "playing" && isMyTurn && !isBuzzer && selectedGap !== null && (
          <Button
            title="Place Here"
            onPress={handleConfirmPlacement}
          />
        )}

        {phase === "playing" && isBuzzer && buzzGap !== null && (
          <Button
            title="Place Here"
            onPress={handleConfirmBuzzPlacement}
          />
        )}

        {phase === "reveal" && (isMyTurn || isHost) && (
          <Button title="Next Round →" onPress={handleNextRound} />
        )}

        {phase === "finished" && (
          <View style={styles.finishedButtons}>
            <Button
              title="Home"
              onPress={handleGoHome}
              variant="ghost"
              style={styles.flex1}
            />
            <Button
              title="Rematch"
              onPress={handleRematch}
              style={styles.flex1}
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
    height: SIZES.headerHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: COLORS.accent,
    letterSpacing: 2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerCode: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 2,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.secondary,
    paddingVertical: 2,
    paddingHorizontal: 10,
    borderRadius: 6,
    overflow: "hidden",
  },
  playlistBanner: {
    paddingVertical: 6,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  playlistName: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: "center",
    fontWeight: "500",
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 20,
    paddingBottom: 40,
  },
  phaseContainer: {
    alignItems: "center",
    gap: 24,
  },
  section: {
    width: "100%",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    color: COLORS.textSecondary,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: 4,
  },
  hint: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 8,
  },
  turnText: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.accent,
    textAlign: "center",
  },
  turnTextOther: {
    fontSize: 18,
    color: COLORS.textPrimary,
    textAlign: "center",
  },
  gameOverTitle: {
    fontSize: 36,
    fontWeight: "900",
    color: COLORS.textPrimary,
    textAlign: "center",
  },
  leaveLink: {
    fontSize: 13,
    color: COLORS.textSecondary,
    opacity: 0.6,
    marginTop: 8,
  },
  finishedButtons: {
    flexDirection: "row",
    gap: 12,
  },
  flex1: {
    flex: 1,
  },
});
