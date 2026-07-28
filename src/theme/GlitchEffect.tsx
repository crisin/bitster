import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

/**
 * "Bad reception" 📡 — the screen loses the signal for a split second:
 * horizontal tear bars flash across the UI and (on web) the whole app jitters
 * and skews like a TV with a loose antenna cable.
 *
 * The tear bars are plain RN views, so they work on every platform. The jitter
 * transforms the app root DOM node directly (web only) — transform and the melt
 * effect's filter are independent style properties, so both stack cleanly.
 *
 * The burst itself is a hook, because two things fire it: the ambient effect on
 * a timer, and the click effect on every tap. Both must LOOK the same.
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

function appRoot(): HTMLElement | null {
  return Platform.OS === "web" && typeof document !== "undefined"
    ? document.getElementById("root")
    : null;
}

/**
 * Two bursts can overlap (a click during an ambient drop). Both want to shake
 * the same root node, so ownership is counted — the transform is only cleared
 * once the last one is done, otherwise the first to finish would freeze the
 * screen mid-skew.
 */
let activeShakes = 0;

function beginShake(): void {
  activeShakes++;
}

function endShake(): void {
  activeShakes = Math.max(0, activeShakes - 1);
  if (activeShakes === 0) {
    const root = appRoot();
    if (root) root.style.transform = "";
  }
}

function shake(strength: number): void {
  const root = appRoot();
  if (!root) return;
  const dx = (Math.random() * 10 - 5) * strength;
  const dy = (Math.random() * 4 - 2) * strength;
  const skew = (Math.random() * 2.4 - 1.2) * strength;
  root.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) skewX(${skew.toFixed(2)}deg)`;
}

function makeBars(accent: string, strength: number): TearBar[] {
  const palette = [accent, "#ffffff", "#00f0ff", "#ff2965"];
  const count = 1 + Math.round((2 + Math.random() * 3) * strength);
  return Array.from({ length: count }, (_, i) => ({
    key: Math.random(),
    top: Math.random(),
    height: 2 + Math.random() * 12 * strength,
    left: (Math.random() - 0.5) * 40 * strength,
    color:
      palette[(i + Math.floor(Math.random() * palette.length)) % palette.length]!,
    opacity: 0.12 + Math.random() * 0.3,
  }));
}

/** How often the damage is re-shuffled inside one burst */
const STEP_MS = 45;

interface BurstOptions {
  accent: string;
  /** 0..1 — how violent a burst is (bar count, size, shake amplitude) */
  intensity?: number;
}

/**
 * One signal drop. `burst()` starts it; the returned bars are what to render.
 * The rapid re-shuffle inside the burst is what sells "the signal is fighting
 * for its life" — a single static frame looks like a bug, not an effect.
 */
export function useGlitchBurst({ accent, intensity = 0.5 }: BurstOptions) {
  const [bars, setBars] = useState<TearBar[]>([]);
  const alive = useRef(true);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (stepTimer.current) clearInterval(stepTimer.current);
      if (endTimer.current) clearTimeout(endTimer.current);
      if (running.current) {
        running.current = false;
        endShake();
      }
    };
  }, []);

  const burst = useCallback(
    (durationMs?: number) => {
      if (reducedMotion()) return;
      const strength = Math.min(1.4, Math.max(0.15, intensity * 2));
      // A second burst restarts the damage rather than stacking timers
      if (stepTimer.current) clearInterval(stepTimer.current);
      if (endTimer.current) clearTimeout(endTimer.current);
      if (!running.current) {
        running.current = true;
        beginShake();
      }

      const duration = durationMs ?? 150 + Math.random() * 300;
      stepTimer.current = setInterval(() => {
        if (!alive.current) return;
        setBars(makeBars(accent, strength));
        shake(strength);
      }, STEP_MS);
      setBars(makeBars(accent, strength));
      shake(strength);

      endTimer.current = setTimeout(() => {
        if (stepTimer.current) clearInterval(stepTimer.current);
        stepTimer.current = null;
        if (running.current) {
          running.current = false;
          endShake();
        }
        if (!alive.current) return;
        setBars([]);
      }, duration);
    },
    [accent, intensity],
  );

  return { bars, burst };
}

/** Renders whatever a burst produced — nothing when the signal is fine */
export function GlitchBars({ bars }: { bars: TearBar[] }) {
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

interface GlitchEffectProps {
  /** Effect speed multiplier — faster = more frequent signal drops */
  factor: number;
  accent: string;
  intensity?: number;
}

/** Ambient version: drops the signal every few seconds, all by itself */
export function GlitchEffect({ factor, accent, intensity }: GlitchEffectProps) {
  const { bars, burst } = useGlitchBurst({ accent, intensity });
  const burstRef = useRef(burst);
  burstRef.current = burst;

  useEffect(() => {
    if (reducedMotion()) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      // Signal drops every few seconds; the speed setting turns the dial
      const wait = (2500 + Math.random() * 5000) / factor;
      timer = setTimeout(() => {
        burstRef.current();
        schedule();
      }, wait);
    };
    schedule();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [factor]);

  return <GlitchBars bars={bars} />;
}
