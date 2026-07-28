import { createThemedStyles, useThemeColors } from "@/theme/themedStyles";
import { RADIUS, SPACE } from "@/utils/constants";
import React, { useCallback, useRef, useState } from "react";
import {
  PanResponder,
  Platform,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from "react-native";

const THUMB_SIZE = 24;
const TRACK_HEIGHT = 6;

interface SliderProps {
  value: number;
  min: number;
  max: number;
  /** Snap increment, e.g. 0.05 — 0 disables snapping */
  step?: number;
  onValueChange: (value: number) => void;
  /** Accessibility description of the control */
  label: string;
  disabled?: boolean;
}

/**
 * Dependency-free drag slider (RN core ships none) — tap or drag on the
 * track, arrow keys on web, increment/decrement for screen readers.
 *
 * Gesture contract: nothing is emitted on touch-down. A horizontal drag emits
 * continuously (deduped per snap step); a plain tap emits on release. If a
 * surrounding ScrollView steals the gesture (vertical scroll), nothing was
 * emitted yet — so scrolling across the slider can't wreck the setting.
 */
export function Slider({
  value,
  min,
  max,
  step = 0,
  onValueChange,
  label,
  disabled = false,
}: SliderProps) {
  const styles = useStyles();
  const COLORS = useThemeColors();
  const [trackWidth, setTrackWidth] = useState(0);
  // Refs so the PanResponder (created once) always sees current values
  const stateRef = useRef({ trackWidth, min, max, step, onValueChange, disabled });
  stateRef.current = { trackWidth, min, max, step, onValueChange, disabled };
  const lastEmitted = useRef<number | null>(null);
  const dragging = useRef(false);

  const snapValueAt = useCallback((evt: GestureResponderEvent): number | null => {
    const { trackWidth: w, min: lo, max: hi, step: snap, disabled: off } =
      stateRef.current;
    if (off || w <= 0) return null;
    const x = Math.min(Math.max(evt.nativeEvent.locationX, 0), w);
    let next = lo + (x / w) * (hi - lo);
    if (snap > 0) next = Math.round(next / snap) * snap;
    return Math.min(hi, Math.max(lo, next));
  }, []);

  const emit = useCallback((next: number | null) => {
    if (next === null) return;
    // Dedupe per snap step — pan-move fires far more often than values change
    if (lastEmitted.current !== null && Math.abs(next - lastEmitted.current) < 1e-9)
      return;
    lastEmitted.current = next;
    stateRef.current.onValueChange(next);
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      // Touch-down claims the responder but emits NOTHING yet — a vertical
      // flick can still be stolen by the ScrollView without side effects
      onStartShouldSetPanResponder: () => !stateRef.current.disabled,
      // Movement is only ours when it's clearly horizontal
      onMoveShouldSetPanResponder: (_evt, g) =>
        !stateRef.current.disabled && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderTerminationRequest: (_evt, g) =>
        // Give the gesture up to a vertical scroll, keep horizontal drags
        !dragging.current || Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        dragging.current = false;
        lastEmitted.current = null;
      },
      onPanResponderMove: (evt, g) => {
        if (!dragging.current && Math.abs(g.dx) <= Math.abs(g.dy)) return;
        dragging.current = true;
        emit(snapValueAt(evt));
      },
      onPanResponderRelease: (evt) => {
        // Covers the plain tap (no movement) — set where the finger landed
        emit(snapValueAt(evt));
        dragging.current = false;
      },
      onPanResponderTerminate: () => {
        // Stolen by the scroll view — nothing to revert, nothing was emitted
        dragging.current = false;
      },
    }),
  ).current;

  const nudge = useCallback(
    (direction: 1 | -1) => {
      const { min: lo, max: hi, step: snap, onValueChange: change, disabled: off } =
        stateRef.current;
      if (off) return;
      const increment = snap > 0 ? snap * 5 : (hi - lo) / 20;
      const next = Math.min(hi, Math.max(lo, value + direction * increment));
      change(next);
    },
    [value],
  );

  // Web keyboard support — RN web forwards DOM key events to this prop
  const webProps =
    Platform.OS === "web"
      ? ({
          focusable: true,
          onKeyDown: (e: { key: string; preventDefault: () => void }) => {
            if (e.key === "ArrowRight" || e.key === "ArrowUp") {
              e.preventDefault();
              nudge(1);
            } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              e.preventDefault();
              nudge(-1);
            }
          },
        } as Record<string, unknown>)
      : null;

  const ratio = max > min ? (value - min) / (max - min) : 0;
  const clampedRatio = Math.min(1, Math.max(0, ratio));

  return (
    <View
      style={[styles.hitArea, disabled && styles.disabled]}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: Math.round(value * 100) / 100 }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) =>
        nudge(e.nativeEvent.actionName === "increment" ? 1 : -1)
      }
      {...webProps}
      {...panResponder.panHandlers}
    >
      <View style={styles.track}>
        <View
          style={[styles.fill, { width: `${clampedRatio * 100}%` }]}
          pointerEvents="none"
        />
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.thumb,
          {
            left: clampedRatio * Math.max(trackWidth - THUMB_SIZE, 0),
            borderColor: COLORS.accent,
          },
        ]}
      />
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) =>
  StyleSheet.create({
    hitArea: {
      height: 40,
      justifyContent: "center",
      width: "100%",
    },
    disabled: {
      opacity: 0.4,
    },
    track: {
      height: TRACK_HEIGHT,
      borderRadius: RADIUS.full,
      backgroundColor: COLORS.bgElevated,
      overflow: "hidden",
      marginHorizontal: SPACE.xs,
    },
    fill: {
      height: "100%",
      backgroundColor: COLORS.accent,
      borderRadius: RADIUS.full,
    },
    thumb: {
      position: "absolute",
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: THUMB_SIZE / 2,
      borderWidth: 3,
      backgroundColor: COLORS.bgCard,
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
  }),
);
