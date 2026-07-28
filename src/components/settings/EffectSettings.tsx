import React, { useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Chip } from "@/components/ui/Chip";
import { Divider } from "@/components/ui/Divider";
import { Pressable } from "@/components/ui/Pressable";
import { Slider } from "@/components/ui/Slider";
import { useThemeStore } from "@/theme/store";
import {
  BPM_SPEED_ID,
  bpmFromTaps,
  CUSTOM_SPEED_ID,
  EFFECT_SPEEDS,
  getEffectSpeed,
  MAX_FACTOR,
  MIN_FACTOR,
} from "@/theme/effectTempo";
import { createThemedStyles, useTheme } from "@/theme/themedStyles";
import { haptics } from "@/hooks/useHaptics";
import { FONT, RADIUS, SPACE, LABEL_STYLE, TOUCH } from "@/utils/constants";

/**
 * Speed control for the animated theme effects (rainbow, swirl, pulse,
 * floaties): presets from chill to hyper, or BPM mode — tap along with the
 * song and the effects lock onto the beat. Only shown when the active theme
 * actually animates something.
 */
export function EffectSettings() {
  const styles = useStyles();
  const theme = useTheme();
  const speedId = useThemeStore((s) => s.effectSpeedId);
  const bpm = useThemeStore((s) => s.effectBpm);
  const factor = useThemeStore((s) => s.effectFactor);
  const setEffectSpeed = useThemeStore((s) => s.setEffectSpeed);
  const setEffectBpm = useThemeStore((s) => s.setEffectBpm);
  const setEffectFactor = useThemeStore((s) => s.setEffectFactor);

  const taps = useRef<number[]>([]);
  const [tapCount, setTapCount] = useState(0);

  const handleTap = useCallback(() => {
    const now = Date.now();
    // A long pause starts a fresh measurement
    const last = taps.current[taps.current.length - 1];
    if (last !== undefined && now - last > 2000) {
      taps.current = [];
    }
    taps.current = [...taps.current, now].slice(-8);
    setTapCount(taps.current.length);
    const measured = bpmFromTaps(taps.current);
    if (measured !== null) setEffectBpm(measured);
    haptics.tap();
  }, [setEffectBpm]);

  const nudgeBpm = useCallback(
    (delta: number) => {
      taps.current = [];
      setTapCount(0);
      setEffectBpm(bpm + delta);
    },
    [bpm, setEffectBpm],
  );

  const fx = theme.effects;
  const animated = fx.rainbow || fx.swirl || fx.pulse || fx.floaties !== null;
  if (!animated) return null;

  const bpmMode = speedId === BPM_SPEED_ID;
  // The slider always shows the effective factor; dragging it switches to
  // custom mode. Presets/BPM move it to their spot as visual feedback.
  const sliderValue =
    speedId === CUSTOM_SPEED_ID
      ? factor
      : bpmMode
        ? bpm / 120
        : (getEffectSpeed(speedId)?.factor ?? 1);

  return (
    <View style={styles.container}>
      <Divider />
      <Text style={styles.sectionTitle}>Effect speed</Text>
      <View style={styles.chipRow}>
        {EFFECT_SPEEDS.map((s) => (
          <Chip
            key={s.id}
            label={s.name}
            selected={s.id === speedId}
            onPress={() => setEffectSpeed(s.id)}
          />
        ))}
      </View>

      <View style={styles.sliderRow}>
        <Text style={styles.sliderEdge}>🐌</Text>
        <View style={styles.sliderTrack}>
          <Slider
            value={sliderValue}
            min={MIN_FACTOR}
            max={MAX_FACTOR}
            step={0.05}
            onValueChange={setEffectFactor}
            label="Effect animation speed"
          />
        </View>
        <Text style={styles.sliderEdge}>🚀</Text>
        <Text style={styles.sliderValue}>
          {sliderValue.toFixed(2).replace(/0$/, "")}×
        </Text>
      </View>

      {bpmMode && (
        <View style={styles.bpmBox}>
          <View style={styles.bpmReadout}>
            <Text style={styles.bpmValue}>{bpm}</Text>
            <Text style={styles.bpmUnit}>BPM</Text>
            <View style={styles.nudges}>
              <Chip label="−5" onPress={() => nudgeBpm(-5)} />
              <Chip label="+5" onPress={() => nudgeBpm(5)} />
            </View>
          </View>
          <Pressable
            onPress={handleTap}
            label="Tap to the beat to measure BPM"
            style={styles.tapButton}
          >
            <Text style={styles.tapLabel}>
              🥁 TAP{tapCount > 0 && tapCount < 4 ? ` (${tapCount})` : ""}
            </Text>
          </Pressable>
          <Text style={styles.hint}>
            Tap along with the song — rainbow, swirl and pulse lock onto the
            beat.
          </Text>
        </View>
      )}
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) =>
  StyleSheet.create({
    container: {
      gap: SPACE.sm,
    },
    sectionTitle: {
      ...LABEL_STYLE,
      color: COLORS.textSecondary,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: SPACE.sm,
    },
    sliderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.sm,
    },
    sliderTrack: {
      flex: 1,
    },
    sliderEdge: {
      fontSize: FONT.size.base,
    },
    sliderValue: {
      width: 48,
      textAlign: "right",
      fontSize: FONT.size.sm,
      fontWeight: FONT.weight.semibold,
      color: COLORS.accent,
      fontVariant: ["tabular-nums"],
    },
    bpmBox: {
      gap: SPACE.sm,
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgCard,
    },
    bpmReadout: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: SPACE.sm,
    },
    bpmValue: {
      fontSize: FONT.size["2xl"],
      fontWeight: FONT.weight.bold,
      color: COLORS.accent,
    },
    bpmUnit: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
    },
    nudges: {
      flexDirection: "row",
      gap: SPACE.sm,
      marginLeft: "auto",
    },
    tapButton: {
      minHeight: TOUCH.minHeight + 12,
      borderRadius: RADIUS.md,
      borderWidth: 2,
      borderColor: COLORS.accent,
      backgroundColor: COLORS.accentLight,
      alignItems: "center",
      justifyContent: "center",
    },
    tapLabel: {
      fontSize: FONT.size.lg,
      fontWeight: FONT.weight.bold,
      color: COLORS.accent,
      letterSpacing: 2,
    },
    hint: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
      opacity: 0.8,
    },
  }),
);
