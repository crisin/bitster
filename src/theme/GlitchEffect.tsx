import React, { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

/**
 * "Bad reception" 📡 — every few seconds the screen loses the signal for a
 * split second: horizontal tear bars flash across the UI and (on web) the
 * whole app jitters and skews like a TV with a loose antenna cable.
 *
 * The tear bars are plain RN views, so they work on every platform. The
 * jitter transforms the app root DOM node directly (web only) — transform
 * and the melt effect's filter are independent style properties, so both
 * effects stack cleanly.
 */

interface TearBar {
  key: number;
  /** 0..1 vertical position */
  top: number;
  height: number;
  /** Horizontal offset makes slices look torn out of sync */
  left: number;
  color: string;
  opacity: number;
}

function reducedMotion(): boolean {
  return (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
  );
}

function makeBars(accent: string): TearBar[] {
  const palette = [accent, "#ffffff", "#00f0ff", "#ff2965"];
  const count = 2 + Math.floor(Math.random() * 3);
  return Array.from({ length: count }, (_, i) => ({
    key: Math.random(),
    top: Math.random(),
    height: 2 + Math.random() * 12,
    left: (Math.random() - 0.5) * 40,
    color: palette[(i + Math.floor(Math.random() * palette.length)) % palette.length],
    opacity: 0.12 + Math.random() * 0.3,
  }));
}

interface GlitchEffectProps {
  /** Effect speed multiplier — faster = more frequent signal drops */
  factor: number;
  accent: string;
}

export function GlitchEffect({ factor, accent }: GlitchEffectProps) {
  const [bars, setBars] = useState<TearBar[]>([]);
  const alive = useRef(true);

  useEffect(() => {
    if (reducedMotion()) return;
    alive.current = true;
    let burstTimer: ReturnType<typeof setTimeout> | null = null;
    let endTimer: ReturnType<typeof setTimeout> | null = null;
    let stepTimer: ReturnType<typeof setInterval> | null = null;
    const root =
      Platform.OS === "web" && typeof document !== "undefined"
        ? document.getElementById("root")
        : null;

    const resetRoot = () => {
      if (root) root.style.transform = "";
    };

    const scheduleBurst = () => {
      // Signal drops every few seconds; the speed setting turns the dial
      const wait = (2500 + Math.random() * 5000) / factor;
      burstTimer = setTimeout(runBurst, wait);
    };

    const runBurst = () => {
      if (!alive.current) return;
      const duration = 150 + Math.random() * 300;
      // Re-randomize the damage a few times within the burst — the rapid
      // re-shuffle is what sells "the signal is fighting for its life"
      stepTimer = setInterval(() => {
        if (!alive.current) return;
        setBars(makeBars(accent));
        if (root) {
          const dx = (Math.random() * 10 - 5).toFixed(1);
          const dy = (Math.random() * 4 - 2).toFixed(1);
          const skew = (Math.random() * 2.4 - 1.2).toFixed(2);
          root.style.transform = `translate(${dx}px, ${dy}px) skewX(${skew}deg)`;
        }
      }, 45);
      endTimer = setTimeout(() => {
        if (stepTimer) clearInterval(stepTimer);
        stepTimer = null;
        if (!alive.current) return;
        setBars([]);
        resetRoot();
        scheduleBurst();
      }, duration);
    };

    scheduleBurst();
    return () => {
      alive.current = false;
      if (burstTimer) clearTimeout(burstTimer);
      if (endTimer) clearTimeout(endTimer);
      if (stepTimer) clearInterval(stepTimer);
      resetRoot();
    };
  }, [factor, accent]);

  if (bars.length === 0) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      {bars.map((bar) => (
        <View
          key={bar.key}
          style={{
            position: "absolute",
            top: `${bar.top * 100}%`,
            left: bar.left,
            right: -bar.left,
            height: bar.height,
            backgroundColor: bar.color,
            opacity: bar.opacity,
          }}
        />
      ))}
    </View>
  );
}
