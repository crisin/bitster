import React, { useState, useCallback, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
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
import { LobbyView } from "@/components/game/phases/LobbyView";
import { PlayingView } from "@/components/game/phases/PlayingView";
import { HitsterWindowView } from "@/components/game/phases/HitsterWindowView";
import { RevealView } from "@/components/game/phases/RevealView";
import { FinishedView } from "@/components/game/phases/FinishedView";
import { haptics } from "@/hooks/useHaptics";
import { COLORS, FONT, RADIUS, SPACE, LAYOUT } from "@/utils/constants";

export default function GameScreen() {
  const params = useLocalSearchParams<{
    code: string;
    host: string;
    name: string;
  }>();

  const phase = useGameStore((s) => s.phase);
  const players = useGameStore((s) => s.players);
  const lastResult = useGameStore((s) => s.lastResult);
  const buzzerId = useGameStore((s) => s.buzzerId);
  const playlistName = useGameStore((s) => s.playlistName);
  const connectionStatus = useConnectionStatus();
  const connectionError = useP2PStore((s) => s.lastError);
  const { isMyTurn, isHost, myPeerId } = useCurrentPlayer();

  const [playlistUrl, setPlaylistUrl] = useState("");
  const [selectedGap, setSelectedGap] = useState<number | null>(null);
  const [buzzGap, setBuzzGap] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const isBuzzer = buzzerId != null && buzzerId === myPeerId;

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

  // Clear gap selection when the phase moves on
  useEffect(() => {
    setSelectedGap(null);
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

  const handleStartGame = useCallback(() => {
    dispatch({
      type: "start-game",
      payload: { playlistUrl: playlistUrl.trim() },
    });
  }, [playlistUrl]);

  const handleNextRound = useCallback(() => {
    dispatch({ type: "next-round" });
  }, []);

  const handleReveal = useCallback(() => {
    dispatch({ type: "reveal-song" });
  }, []);

  const handleRematch = useCallback(() => {
    dispatch({ type: "rematch" });
  }, []);

  const handleGoHome = useCallback(() => {
    leave();
    router.replace("/");
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
        {phase === "lobby" && (
          <LobbyView
            code={code}
            playlistUrl={playlistUrl}
            onPlaylistUrlChange={setPlaylistUrl}
            onStartGame={handleStartGame}
            onLeave={handleGoHome}
          />
        )}

        {phase === "playing" && (
          <PlayingView selectedGap={selectedGap} onGapSelect={handleGapSelect} />
        )}

        {phase === "hitster-window" && (
          <HitsterWindowView
            buzzGap={buzzGap}
            onBuzzGapSelect={handleBuzzGapSelect}
          />
        )}

        {phase === "reveal" && <RevealView />}

        {phase === "finished" && <FinishedView />}
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
  finishedButtons: {
    flexDirection: "row",
    gap: SPACE.md,
  },
  flex1: {
    flex: 1,
  },
});
