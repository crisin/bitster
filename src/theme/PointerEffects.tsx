import React, { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import type { ViewStyle } from "react-native";
import { GlitchBars, useGlitchBurst } from "./GlitchEffect";

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
  /** Signal drop on every click */
  clickGlitch: boolean;
  accent: string;
  /** Effect speed factor from the theme tempo — higher is faster */
  factor: number;
  /** 0..1 — lens size and how hard it bends */
  warpIntensity: number;
  /** 0..1 — how wide the lit circle is */
  flashlightIntensity: number;
  /** 0..1 — how violent a click burst is */
  clickGlitchIntensity: number;
}

/** Lens radius at intensity 0 and 1 */
const WARP_MIN = 60;
const WARP_MAX = 220;
/** Lit radius at intensity 0 and 1 */
const LIGHT_MIN = 90;
const LIGHT_MAX = 340;
/** How long a click burst lasts, before the tempo factor is applied */
const GLITCH_MS = 260;

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * Math.min(1, Math.max(0, t));
}

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
function WarpLens({ point, intensity }: { point: Point; intensity: number }) {
  const radius = lerp(WARP_MIN, WARP_MAX, intensity);
  // Scale the distortion with the size too, or a big lens just looks like a
  // big smudge
  const strength = 0.4 + intensity * 1.6;
  return (
    <View
      style={[
        styles.lens,
        {
          left: point.x - radius,
          top: point.y - radius,
          width: radius * 2,
          height: radius * 2,
          borderRadius: radius,
        },
        Platform.OS === "web"
          ? ({
              backdropFilter: warpFilter(strength),
              WebkitBackdropFilter: warpFilter(strength),
              boxShadow: `inset 0 0 ${Math.round(radius * 0.4)}px rgba(255,255,255,0.18)`,
            } as unknown as ViewStyle)
          : null,
      ]}
    />
  );
}

function warpFilter(strength: number): string {
  return (
    `blur(${(strength * 1.6).toFixed(1)}px) ` +
    `saturate(${(1 + strength).toFixed(2)}) ` +
    `hue-rotate(${Math.round(strength * 30)}deg) ` +
    `contrast(${(1 + strength * 0.25).toFixed(2)})`
  );
}

/** Darkness everywhere but a soft circle around the cursor */
function Flashlight({ point, intensity }: { point: Point; intensity: number }) {
  const radius = Math.round(lerp(LIGHT_MIN, LIGHT_MAX, intensity));
  return (
    <View
      style={[
        StyleSheet.absoluteFillObject,
        {
          backgroundImage:
            `radial-gradient(circle ${radius}px at ${point.x}px ${point.y}px, ` +
            "rgba(0,0,0,0) 0%, rgba(0,0,0,0.12) 45%, rgba(0,0,0,0.88) 100%)",
        } as unknown as ViewStyle,
      ]}
    />
  );
}

/**
 * A click drops the signal, using the exact same burst as the ambient glitch —
 * the tear bars, the palette and the screen shake all come from one place, so
 * a click never looks like a cheaper imitation of the real thing.
 */
function ClickGlitch({
  accent,
  factor,
  intensity,
}: {
  accent: string;
  factor: number;
  intensity: number;
}) {
  const { bars, burst } = useGlitchBurst({ accent, intensity });
  const burstRef = useRef(burst);
  burstRef.current = burst;

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onDown = () => {
      // Short and snappy: a click should punch, not linger like a signal drop
      burstRef.current(Math.max(90, GLITCH_MS / Math.max(factor, 0.25)));
    };
    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => window.removeEventListener("pointerdown", onDown);
  }, [factor]);

  return <GlitchBars bars={bars} />;
}

export function PointerEffects({
  warp,
  flashlight,
  clickGlitch,
  accent,
  factor,
  warpIntensity,
  flashlightIntensity,
  clickGlitchIntensity,
}: PointerEffectsProps) {
  const point = usePointer(warp || flashlight);
  // No pointer to follow (touch device, or the cursor left the window)
  if (Platform.OS !== "web") return null;

  return (
    <>
      {flashlight && point && (
        <Flashlight point={point} intensity={flashlightIntensity} />
      )}
      {warp && point && <WarpLens point={point} intensity={warpIntensity} />}
      {clickGlitch && (
        <ClickGlitch
          accent={accent}
          factor={factor}
          intensity={clickGlitchIntensity}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  lens: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
});
