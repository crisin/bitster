import React, { useEffect, useState } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { useGameStore } from "@/game/store";
import { useCurrentPlayer } from "@/hooks/useCurrentPlayer";
import { dispatch } from "@/p2p/connection";
import { useP2PStore } from "@/p2p/store";
import { DEFAULT_RANDOM_POOL } from "@/game/types";
import { getProvider } from "@/streaming/registry";
import { useStreamingStore } from "@/streaming/store";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Pressable } from "@/components/ui/Pressable";
import { RoomCode } from "@/components/lobby/RoomCode";
import { PlayerSlot } from "@/components/lobby/PlayerSlot";
import { GameSettings } from "@/components/lobby/GameSettings";
import { DeviceSelector } from "@/components/streaming/DeviceSelector";
import { FONT, RADIUS, SPACE, LABEL_STYLE } from "@/utils/constants";
import { createThemedStyles } from "@/theme/themedStyles";

interface LobbyViewProps {
  code: string;
  playlistUrl: string;
  onPlaylistUrlChange: (url: string) => void;
  onStartGame: () => void;
  onLeave: () => void;
}

type PlaylistCheck = "idle" | "checking" | "valid" | "invalid";
type SourceMode = "link" | "random";

const CHECK_DEBOUNCE_MS = 700;

export function LobbyView({
  code,
  playlistUrl,
  onPlaylistUrlChange,
  onStartGame,
  onLeave,
}: LobbyViewProps) {
  const styles = useStyles();
  const players = useGameStore((s) => s.players);
  const hostId = useGameStore((s) => s.hostId);
  const playlistName = useGameStore((s) => s.playlistName);
  const playlistImageUrl = useGameStore((s) => s.playlistImageUrl);
  const playlistTrackCount = useGameStore((s) => s.playlistTrackCount);
  const probe = useStreamingStore((s) => s.playlistProbe);
  const { isHost } = useCurrentPlayer();

  const [checkState, setCheckState] = useState<PlaylistCheck>("idle");
  const [localName, setLocalName] = useState("");
  const [sourceMode, setSourceMode] = useState<SourceMode>("link");
  const hostTask = useP2PStore((s) => s.hostTask);

  const handleRollTheDice = () => {
    dispatch({
      type: "set-random-pool",
      payload: { target: DEFAULT_RANDOM_POOL },
    });
  };

  const localPlayers = players.filter((p) => p.isLocal);

  const handleAddLocal = () => {
    const name = localName.trim();
    if (name.length < 2) return;
    dispatch({ type: "add-local-player", payload: { name } });
    setLocalName("");
  };

  const handleRemoveLocal = (playerId: string) => {
    dispatch({ type: "remove-local-player", payload: { playerId } });
  };

  // Host: check the pasted URL (debounced) and share the playlist with everyone
  useEffect(() => {
    if (!isHost || sourceMode !== "link") return;
    const url = playlistUrl.trim();
    if (!url) {
      setCheckState("idle");
      return;
    }

    setCheckState("checking");
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const providerId = useStreamingStore.getState().activeProviderId;
        const provider = providerId ? getProvider(providerId) : null;
        const playlistId = provider?.library.parsePlaylistUrl(url) ?? null;
        if (!provider || !playlistId) {
          if (!cancelled) setCheckState("invalid");
          return;
        }
        try {
          const meta = await provider.library.getPlaylistMeta(playlistId);
          if (cancelled) return;
          if (meta.trackCount === 0) {
            setCheckState("invalid");
            return;
          }
          setCheckState("valid");
          // Authoritative copy lives with the host session → broadcast to peers
          dispatch({ type: "set-playlist", payload: { playlistUrl: url } });
        } catch {
          if (!cancelled) setCheckState("invalid");
        }
      })();
    }, CHECK_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [playlistUrl, isHost, sourceMode]);

  const showPlaylistCard =
    playlistName != null && (!isHost || checkState === "valid" || checkState === "idle");

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
            isLocal={p.isLocal}
            connectionStatus={p.connected ? "connected" : "connecting"}
            onRemove={
              isHost && p.isLocal ? () => handleRemoveLocal(p.id) : undefined
            }
          />
        ))}
        {players.length === 0 && (
          <Text style={styles.hint}>Waiting for players...</Text>
        )}
      </View>

      {/* Pass-and-play: extra players sharing the host's device */}
      {isHost && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Local Players ({localPlayers.length})
          </Text>
          <Text style={styles.localHint}>
            Playing together on this device? Add them here — they take their
            turns right on your screen.
          </Text>
          <View style={styles.addLocalRow}>
            <View style={styles.addLocalInput}>
              <Input
                placeholder="Player name"
                label="Local player name"
                value={localName}
                onChangeText={setLocalName}
                maxLength={20}
                returnKeyType="done"
                onSubmitEditing={handleAddLocal}
              />
            </View>
            <Button
              title="+ Add"
              onPress={handleAddLocal}
              variant="secondary"
              disabled={localName.trim().length < 2}
              label="Add local player"
            />
          </View>
        </View>
      )}

      <DeviceSelector />

      {isHost && (
        <View style={styles.section}>
          <View style={styles.sourceRow}>
            <Pressable
              onPress={() => setSourceMode("link")}
              label="Use a playlist link"
              style={[
                styles.sourceTab,
                sourceMode === "link" && styles.sourceTabActive,
              ]}
            >
              <Text
                style={[
                  styles.sourceTabText,
                  sourceMode === "link" && styles.sourceTabTextActive,
                ]}
              >
                PLAYLIST LINK
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSourceMode("random")}
              label="Use random songs from your own playlists"
              style={[
                styles.sourceTab,
                sourceMode === "random" && styles.sourceTabActive,
              ]}
            >
              <Text
                style={[
                  styles.sourceTabText,
                  sourceMode === "random" && styles.sourceTabTextActive,
                ]}
              >
                🎲 SURPRISE ME
              </Text>
            </Pressable>
          </View>

          {sourceMode === "link" ? (
            <>
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
              {checkState === "checking" && (
                <Text style={styles.checkingHint}>Checking playlist…</Text>
              )}
              {checkState === "invalid" && (
                <Text style={styles.invalidHint}>
                  ✗ Couldn't load that playlist — check the link and your
                  streaming connection.
                </Text>
              )}
            </>
          ) : (
            <>
              <Button
                title={
                  hostTask
                    ? `COLLECTING… ${hostTask.done}/${hostTask.total}`
                    : "ROLL THE DICE"
                }
                onPress={handleRollTheDice}
                disabled={hostTask !== null}
                loading={hostTask !== null}
                label="Collect random songs from your own playlists"
              />
              <Text style={styles.localHint}>
                {DEFAULT_RANDOM_POOL} songs pulled at random from playlists you
                own. It's your music — so everyone else is playing your taste.
              </Text>
            </>
          )}
        </View>
      )}

      {showPlaylistCard && (
        <View
          style={styles.playlistCard}
          accessibilityRole="text"
          accessibilityLabel={`Playlist ${playlistName}, ${playlistTrackCount} songs`}
        >
          {playlistImageUrl ? (
            <Image source={{ uri: playlistImageUrl }} style={styles.playlistCover} />
          ) : (
            <View style={[styles.playlistCover, styles.playlistCoverPlaceholder]}>
              <Text style={styles.playlistCoverIcon}>♫</Text>
            </View>
          )}
          <View style={styles.playlistInfo}>
            <Text style={styles.playlistName} numberOfLines={2}>
              {playlistName}
            </Text>
            {playlistTrackCount > 0 && (
              <Text style={styles.playlistMeta}>{playlistTrackCount} songs</Text>
            )}
            {/* Measured on the HOST's account only, so only the host is told */}
            {isHost && probe && probe.checked > 0 && (
              <Text
                style={[
                  styles.playlistMeta,
                  probe.usable < probe.checked && styles.playlistWarn,
                ]}
              >
                {probe.usable === probe.checked
                  ? `First ${probe.checked} all playable for you`
                  : `${probe.usable}/${probe.checked} of the first tracks playable for you`}
                {probe.availabilityUnknown ? " · availability unknown" : ""}
              </Text>
            )}
          </View>
          <Text style={styles.playlistCheck}>✓</Text>
        </View>
      )}

      {isHost && <GameSettings />}

      {!isHost && (
        <Text style={styles.hint}>Waiting for host to start...</Text>
      )}

      <Pressable onPress={onLeave} label="Leave lobby" style={styles.leaveBtn}>
        <Text style={styles.leaveLink}>Leave lobby</Text>
      </Pressable>
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) => StyleSheet.create({
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
    color: COLORS.textSecondary,
    marginBottom: SPACE.xs,
  },
  hint: {
    color: COLORS.textSecondary,
    fontSize: FONT.size.base,
    textAlign: "center",
    paddingVertical: SPACE.sm,
  },
  checkingHint: {
    color: COLORS.textSecondary,
    fontSize: FONT.size.sm,
  },
  localHint: {
    color: COLORS.textSecondary,
    fontSize: FONT.size.sm,
    lineHeight: 18,
  },
  addLocalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
  },
  addLocalInput: {
    flex: 1,
  },
  invalidHint: {
    color: COLORS.error,
    fontSize: FONT.size.sm,
  },
  playlistCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    padding: SPACE.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.success,
    backgroundColor: COLORS.bgCard,
  },
  playlistCover: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.secondary,
  },
  playlistCoverPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  playlistCoverIcon: {
    fontSize: FONT.size["2xl"],
    color: COLORS.textSecondary,
  },
  playlistInfo: {
    flex: 1,
    gap: 2,
  },
  playlistName: {
    fontSize: FONT.size.md,
    fontWeight: FONT.weight.semibold,
    color: COLORS.textPrimary,
  },
  playlistMeta: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
  },
  playlistWarn: {
    color: COLORS.warning,
  },
  sourceRow: {
    flexDirection: "row",
    gap: SPACE.sm,
  },
  sourceTab: {
    flex: 1,
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sourceTabActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentLight,
  },
  sourceTabText: {
    ...LABEL_STYLE,
    color: COLORS.textSecondary,
  },
  sourceTabTextActive: {
    color: COLORS.accent,
  },
  playlistCheck: {
    fontSize: FONT.size.xl,
    color: COLORS.success,
    fontWeight: FONT.weight.bold,
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
}));
