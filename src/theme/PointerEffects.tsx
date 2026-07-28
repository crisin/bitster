import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";
import type { ViewStyle } from "react-native";

/**
 * Cursor-following effects. Web only, on purpose: they all need a pointer that
 * hovers, and a touch screen has none. They also live OUTSIDE the app's own
 * touch handling — the layer is pointerEvents="none" and reads the position
 * from window events, so nothing here can swallow a tap.
 */

interface PointerEffectsProps {
  /** Glass lens that bends and brightens whatever is under the cursor */
  warp: boolean;
  /** Everything goes dark except a circle around the cursor */
  flashlight: boolean;
  /** Short burst of tear bars and colour split on every click */
  clickGlitch: boolean;
  accent: string;
  /** Effect speed factor from the theme tempo — higher is faster */
  factor: number;
}

const WARP_RADIUS = 110;
const LIGHT_RADIUS = 170;
/** How long a click burst lasts, before the tempo factor is applied */
const GLITCH_MS = 420;

interface Point {
  x: number;
  y: number;
}

/**
 * Last known pointer position. Kept in a ref and mirrored into state at most
 * once per animation frame — a naive setState per pointermove re-renders the
 * whole layer dozens of times a second.
 */
function usePointer(enabled: boolean): Point | null {
  const [point, setPoint] = useState<Point | null>(null);
  const latest = useRef<Point | null>(null);
  const frame = useRef(0);

  useEffect(() => {
    if (!enabled || Platform.OS !== "web" || typeof window === "undefined") {
      return;
    }
    const flush = () => {
      frame.current = 0;
      if (latest.current) setPoint(latest.current);
    };
    const onMove = (event: PointerEvent) => {
      latest.current = { x: event.clientX, y: event.clientY };
      if (frame.current === 0) frame.current = requestAnimationFrame(flush);
    };
    const onLeave = () => setPoint(null);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
      document.removeEventListener("pointerleave", onLeave);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [enabled]);

  return point;
}

/** A circle of bent, over-saturated glass that rides along with the cursor */
function WarpLens({ point }: { point: Point }) {
  return (
    <View
      style={[
        styles.lens,
        {
          left: point.x - WARP_RADIUS,
          top: point.y - WARP_RADIUS,
        },
        warpStyle,
      ]}
    />
  );
}

/** Darkness everywhere but a soft circle around the cursor */
function Flashlight({ point }: { point: Point }) {
  return (
    <View
      style={[
        StyleSheet.absoluteFillObject,
        {
          backgroundImage:
            `radial-gradient(circle ${LIGHT_RADIUS}px at ${point.x}px ${point.y}px, ` +
            "rgba(0,0,0,0) 0%, rgba(0,0,0,0.12) 45%, rgba(0,0,0,0.88) 100%)",
        } as unknown as ViewStyle,
      ]}
    />
  );
}

/** One tear bar of a click burst */
function TearBar({
  progress,
  index,
  accent,
}: {
  progress: Animated.Value;
  index: number;
  accent: string;
}) {
  // Deterministic per index — a burst should look chaotic, not be random work
  const top: `${number}%` = `${(index * 37) % 90}%`;
  const height = 6 + ((index * 13) % 22);
  const shift = ((index % 2 === 0 ? 1 : -1) * (12 + ((index * 7) % 28)));

  return (
    <Animated.View
      style={[
        styles.tear,
        {
          top,
          height,
          backgroundColor: index % 3 === 0 ? accent : "rgba(255,255,255,0.75)",
          opacity: progress.interpolate({
            inputRange: [0, 0.15, 0.6, 1],
            outputRange: [0, 0.85, 0.5, 0],
          }),
          transform: [
            {
              translateX: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [shift, -shift],
              }),
            },
          ],
        },
      ]}
    />
  );
}

/** Full-screen burst fired on every click */
function ClickGlitch({ accent, factor }: { accent: string; factor: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onDown = () => setBurst((n) => n + 1);
    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);

  useEffect(() => {
    if (burst === 0) return;
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: Math.max(120, GLITCH_MS / Math.max(factor, 0.25)),
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [burst, factor, progress]);

  if (burst === 0) return null;

  return (
    <Animated.View
      // Remount per burst so a rapid second click restarts cleanly
      key={burst}
      style={[
        StyleSheet.absoluteFillObject,
        {
          opacity: progress.interpolate({
            inputRange: [0, 0.8, 1],
            outputRange: [1, 1, 0],
          }),
        },
      ]}
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <TearBar key={i} progress={progress} index={i + burst} accent={accent} />
      ))}
    </Animated.View>
  );
}

export function PointerEffects({
  warp,
  flashlight,
  clickGlitch,
  accent,
  factor,
}: PointerEffectsProps) {
  const point = usePointer(warp || flashlight);
  // No pointer to follow (touch device, or the cursor left the window)
  if (Platform.OS !== "web") return null;

  return (
    <>
      {flashlight && point && <Flashlight point={point} />}
      {warp && point && <WarpLens point={point} />}
      {clickGlitch && <ClickGlitch accent={accent} factor={factor} />}
    </>
  );
}

// backdrop-filter is a CSS-only trick; RN styles can't express it
const warpStyle =
  Platform.OS === "web"
    ? ({
        backdropFilter: "blur(2px) saturate(1.8) hue-rotate(25deg) contrast(1.15)",
        WebkitBackdropFilter:
          "blur(2px) saturate(1.8) hue-rotate(25deg) contrast(1.15)",
        boxShadow: "inset 0 0 40px rgba(255,255,255,0.18)",
      } as unknown as ViewStyle)
    : null;

const styles = StyleSheet.create({
  lens: {
    position: "absolute",
    width: WARP_RADIUS * 2,
    height: WARP_RADIUS * 2,
    borderRadius: WARP_RADIUS,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  tear: {
    position: "absolute",
    left: 0,
    right: 0,
  },
});
