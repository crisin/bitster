import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useGameStore } from "@/game/store";
import { useCurrentPlayer } from "@/hooks/useCurrentPlayer";
import { Input } from "@/components/ui/Input";
import { Pressable } from "@/components/ui/Pressable";
import { RoomCode } from "@/components/lobby/RoomCode";
import { PlayerSlot } from "@/components/lobby/PlayerSlot";
import { GameSettings } from "@/components/lobby/GameSettings";
import { DeviceSelector } from "@/components/streaming/DeviceSelector";
import { COLORS, FONT, SPACE, LABEL_STYLE } from "@/utils/constants";

interface LobbyViewProps {
  code: string;
  playlistUrl: string;
  onPlaylistUrlChange: (url: string) => void;
  onStartGame: () => void;
  onLeave: () => void;
}

export function LobbyView({
  code,
  playlistUrl,
  onPlaylistUrlChange,
  onStartGame,
  onLeave,
}: LobbyViewProps) {
  const players = useGameStore((s) => s.players);
  const hostId = useGameStore((s) => s.hostId);
  const { isHost } = useCurrentPlayer();

  return (
    <View style={styles.container}>
      <RoomCode code={code} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Players ({players.length})</Text>
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
              onChangeText={onPlaylistUrlChange}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={onStartGame}
            />
          </View>
          <GameSettings />
        </>
      )}

      {!isHost && (
        <Text style={styles.hint}>Waiting for host to start...</Text>
      )}

      <Pressable onPress={onLeave} label="Leave lobby" style={styles.leaveBtn}>
        <Text style={styles.leaveLink}>Leave lobby</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
});
