import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useGameStore } from "@/game/store";
import { useP2PStore } from "@/p2p/store";
import { PlayerTimeline } from "./PlayerTimeline";
import { SPACE, LABEL_STYLE } from "@/utils/constants";

interface AllPlayerTimelinesProps {
  /** Hide the year of the current player's freshly placed card (hitster-window) */
  hideCurrentYear?: boolean;
}

export function AllPlayerTimelines({ hideCurrentYear = false }: AllPlayerTimelinesProps) {
  const players = useGameStore((s) => s.players);
  const timelines = useGameStore((s) => s.timelines);
  const failedTimelines = useGameStore((s) => s.failedTimelines);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const currentSongId = useGameStore((s) => s.currentSongId);
  const myPeerId = useP2PStore((s) => s.myPeerId);

  return (
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
            hideCurrentYear && p.id === currentPlayerId
              ? currentSongId ?? undefined
              : undefined
          }
          failedSongs={failedTimelines[p.id] ?? []}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: "100%",
    gap: SPACE.sm,
  },
  sectionTitle: {
    ...LABEL_STYLE,
    marginBottom: SPACE.xs,
  },
});
