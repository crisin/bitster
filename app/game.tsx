import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useGameStore } from "@/game/store";
import { useCurrentPlayer } from "@/hooks/useCurrentPlayer";
import { useConnectionStatus } from "@/hooks/useConnectionStatus";
import { StatusDot } from "@/components/ui/StatusDot";
import { Button } from "@/components/ui/Button";
import { BottomBar } from "@/components/ui/BottomBar";
import { Timeline } from "@/components/game/Timeline";
import { PlayerList } from "@/components/game/PlayerList";
import { RevealCard } from "@/components/game/RevealCard";
import { NowPlaying } from "@/components/game/NowPlaying";
import { ScoreBoard } from "@/components/game/ScoreBoard";
import { RoomCode } from "@/components/lobby/RoomCode";
import { PlayerSlot } from "@/components/lobby/PlayerSlot";
import { Input } from "@/components/ui/Input";
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
  const connectionStatus = useConnectionStatus();
  const { isMyTurn, isHost, myTimeline, currentPlayer, myPeerId } =
    useCurrentPlayer();

  const [playlistUrl, setPlaylistUrl] = useState("");
  const [selectedGap, setSelectedGap] = useState<number | null>(null);
  const [placing, setPlacing] = useState(false);

  const handleGapSelect = useCallback((position: number) => {
    setSelectedGap(position);
  }, []);

  const handleConfirmPlacement = useCallback(() => {
    if (selectedGap === null || placing) return;
    setPlacing(true);
    // TODO: emit place-song via P2P
    setSelectedGap(null);
  }, [selectedGap, placing]);

  const handleNextRound = useCallback(() => {
    // TODO: emit next-round via P2P
  }, []);

  const handleStartGame = useCallback(() => {
    if (!playlistUrl.trim()) return;
    // TODO: emit start-game via P2P
  }, [playlistUrl]);

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

            {isHost && (
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
            )}

            {!isHost && (
              <Text style={styles.hint}>Waiting for host to start...</Text>
            )}
          </View>
        )}

        {/* PLAYING */}
        {phase === "playing" && (
          <View style={styles.phaseContainer}>
            {isMyTurn ? (
              <Text style={styles.turnText}>
                Your turn! Place the song in your timeline.
              </Text>
            ) : (
              <Text style={styles.turnTextOther}>
                {currentPlayer?.name ?? "Someone"} is placing a song...
              </Text>
            )}

            <NowPlaying />

            <Timeline
              cards={myTimeline}
              interactive={isMyTurn && !placing}
              selectedGap={selectedGap}
              onGapSelect={handleGapSelect}
            />

            <PlayerList
              players={players}
              currentPlayerId={currentPlayerId}
              hostId={hostId}
              myId={myPeerId}
              compact
            />
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
            disabled={!playlistUrl.trim() || players.length < 2}
          />
        )}

        {phase === "playing" && isMyTurn && selectedGap !== null && (
          <Button
            title="Place Here ✓"
            onPress={handleConfirmPlacement}
            loading={placing}
          />
        )}

        {phase === "reveal" && (
          <Button title="Next Round →" onPress={handleNextRound} />
        )}

        {phase === "finished" && (
          <View style={styles.finishedButtons}>
            <Button
              title="Home"
              onPress={() => {
                /* TODO: navigate home */
              }}
              variant="ghost"
              style={styles.flex1}
            />
            <Button
              title="Rematch"
              onPress={() => {
                /* TODO: rematch */
              }}
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
  finishedButtons: {
    flexDirection: "row",
    gap: 12,
  },
  flex1: {
    flex: 1,
  },
});
