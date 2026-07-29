import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { resolveEffectTempo, type EffectTempo } from "./effectTempo";
import { GlitchEffect } from "./GlitchEffect";
import { PointerEffects } from "./PointerEffects";
import { MeltEffect } from "./MeltEffect";
import { useCurrentLook, useThemeStore } from "./store";
import { useTheme } from "./themedStyles";

const NATIVE_DRIVER = Platform.OS !== "web";

/**
 * The user's effect tempo (speed preset, slider, or BPM), reactive but
 * DEBOUNCED: a tempo change restarts every Animated loop, so a slider drag
 * must land as one restart at the end, not sixty per second.
 */
function useEffectTempo(): EffectTempo {
  const speedId = useThemeStore((s) => s.effectSpeedId);
  const bpm = useThemeStore((s) => s.effectBpm);
  const factor = useThemeStore((s) => s.effectFactor);
  const tempo = useMemo(
    () => resolveEffectTempo(speedId, bpm, factor),
    [speedId, bpm, factor],
  );

  const [settled, setSettled] = useState(tempo);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(tempo), 200);
    return () => clearTimeout(timer);
  }, [tempo]);

  return settled;
}

/** One emoji drifting up the screen in an endless loop */
function Floatie({ emoji, index, width, height, factor }: {
  emoji: string;
  index: number;
  width: number;
  height: number;
  factor: number;
}) {
  const drift = useRef(new Animated.Value(0)).current;
  const hasStaggered = useRef(false);
  // Deterministic per-index spread (same trick as the confetti)
  const x = ((index * 173) % 100) / 100;
  const duration = (9000 + ((index * 811) % 6000)) / factor;
  const size = 18 + ((index * 97) % 14);
  const spin = index % 3 !== 0; // two thirds of them tumble
  const spinDir = index % 2 === 0 ? 1 : -1;

  useEffect(() => {
    drift.setValue(0);
    // The stagger delay spreads floaties out ONCE on mount — a tempo change
    // must not send them all below the screen for many seconds again
    const delay = hasStaggered.current ? 0 : (index * 900) / factor;
    hasStaggered.current = true;
    const loop = Animated.loop(
      Animated.timing(drift, {
        toValue: 1,
        duration,
        delay,
        easing: Easing.linear,
        useNativeDriver: NATIVE_DRIVER,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [drift, duration, index, factor]);

  return (
    <Animated.Text
      style={{
        position: "absolute",
        left: x * Math.max(width - 40, 0),
        fontSize: size,
        opacity: drift.interpolate({
          inputRange: [0, 0.1, 0.85, 1],
          outputRange: [0, 0.55, 0.4, 0],
        }),
        transform: [
          {
            translateY: drift.interpolate({
              inputRange: [0, 1],
              outputRange: [height + 40, -60],
            }),
          },
          {
            translateX: drift.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0, index % 2 === 0 ? 28 : -28, 0],
            }),
          },
          {
            rotate: drift.interpolate({
              inputRange: [0, 1],
              outputRange: spin
                ? ["0deg", `${spinDir * 300}deg`]
                : ["0deg", `${spinDir * 24}deg`],
            }),
          },
          {
            scale: drift.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0.85, 1.25, 0.85],
            }),
          },
        ],
      }}
    >
      {emoji}
    </Animated.Text>
  );
}

/**
 * Pulsing ambient accent light (rave). In BPM mode one pulse = one beat,
 * so tapping the tempo in makes the whole screen breathe with the song.
 */
function Pulse({ color, tempo }: { color: string; tempo: EffectTempo }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const beatMs = tempo.bpm !== null ? 60000 / tempo.bpm : 840 / tempo.factor;

  useEffect(() => {
    pulse.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: beatMs * 0.3,
          easing: Easing.out(Easing.quad),
          useNativeDriver: NATIVE_DRIVER,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: beatMs * 0.7,
          easing: Easing.in(Easing.quad),
          useNativeDriver: NATIVE_DRIVER,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, beatMs]);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        {
          backgroundColor: color,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.02, 0.1] }),
        },
      ]}
    />
  );
}

const RAINBOW = [
  "rgba(255, 60, 60, 1)",
  "rgba(255, 200, 0, 1)",
  "rgba(60, 255, 120, 1)",
  "rgba(60, 180, 255, 1)",
  "rgba(200, 60, 255, 1)",
  "rgba(255, 60, 60, 1)",
];

/** Rainbow wash cycling over the whole screen (trippy) */
function Rainbow({ factor }: { factor: number }) {
  const cycle = useRef(new Animated.Value(0)).current;
  const duration = 9000 / factor;

  useEffect(() => {
    cycle.setValue(0);
    const loop = Animated.loop(
      Animated.timing(cycle, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        // Color interpolation never runs on the native driver
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [cycle, duration]);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        {
          opacity: 0.09,
          backgroundColor: cycle.interpolate({
            inputRange: RAINBOW.map((_, i) => i / (RAINBOW.length - 1)),
            outputRange: RAINBOW,
          }),
        },
      ]}
    />
  );
}

// Web-only psychedelic color wheel — conic gradients aren't expressible in RN
const swirlGradientStyle =
  Platform.OS === "web"
    ? ({
        backgroundImage:
          "conic-gradient(from 0deg, rgba(255,60,60,0.9), rgba(255,200,0,0.9), rgba(60,255,120,0.9), rgba(60,180,255,0.9), rgba(200,60,255,0.9), rgba(255,60,60,0.9))",
      } as unknown as ViewStyle)
    : null;

/** Slowly rotating color wheel behind everything (trippy, web only) */
function Swirl({ width, height, factor }: {
  width: number;
  height: number;
  factor: number;
}) {
  const turn = useRef(new Animated.Value(0)).current;
  const duration = 24000 / factor;
  // Big enough that the square's corners never show while rotating
  const size = Math.sqrt(width * width + height * height) * 1.2;

  useEffect(() => {
    turn.setValue(0);
    const loop = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: NATIVE_DRIVER,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [turn, duration]);

  if (!swirlGradientStyle) return null;

  return (
    <Animated.View
      style={[
        swirlGradientStyle,
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          left: (width - size) / 2,
          top: (height - size) / 2,
          opacity: 0.07,
          transform: [
            {
              rotate: turn.interpolate({
                inputRange: [0, 1],
                outputRange: ["0deg", "360deg"],
              }),
            },
          ],
        },
      ]}
    />
  );
}

/** Projector-style brightness flicker (old film) */
function Flicker() {
  const flicker = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flicker, { toValue: 1, duration: 90, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(flicker, { toValue: 0.2, duration: 140, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(flicker, { toValue: 0.8, duration: 70, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(flicker, { toValue: 0, duration: 900, useNativeDriver: NATIVE_DRIVER }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [flicker]);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        {
          backgroundColor: "#000",
          opacity: flicker.interpolate({ inputRange: [0, 1], outputRange: [0, 0.08] }),
        },
      ]}
    />
  );
}

// Web-only textures — CSS gradients aren't expressible in plain RN styles
const scanlineStyle =
  Platform.OS === "web"
    ? ({
        backgroundImage:
          "repeating-linear-gradient(0deg, rgba(0,0,0,0.25) 0px, rgba(0,0,0,0.25) 1px, transparent 1px, transparent 3px)",
      } as unknown as ViewStyle)
    : null;

const vignetteStyle =
  Platform.OS === "web"
    ? ({
        backgroundImage:
          "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)",
      } as unknown as ViewStyle)
    : null;

/** Total floaties on screen — small emoji sets get doubled for density */
function expandFloaties(floaties: string[]): string[] {
  return floaties.length <= 5 ? [...floaties, ...floaties] : floaties;
}

/**
 * Full-screen, non-interactive effect layer. Mounted once in the root layout,
 * above the app content — which effects render is up to the active theme, how
 * fast they run is up to the user's effect-speed setting (incl. tap-tempo BPM).
 */
export function ThemeOverlay() {
  const theme = useTheme();
  const tempo = useEffectTempo();
  // Every dial is part of the per-theme look now — one selector for all
  const look = useCurrentLook();
  const {
    meltIntensity,
    warpIntensity,
    flashlightIntensity,
    clickGlitchIntensity,
  } = look;
  const { width, height } = useWindowDimensions();
  const fx = theme.effects;

  // Web: the page BEHIND the app must match the theme — melt displacement and
  // glitch jitter both expose it at the screen edges (white tear lines
  // otherwise). Must run before the early return below (hook rules).
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    document.body.style.backgroundColor = theme.colors.bgPrimary;
  }, [theme.colors.bgPrimary]);

  const hasAny =
    fx.pulse ||
    fx.rainbow ||
    fx.swirl ||
    fx.melt ||
    fx.glitch ||
    fx.flicker ||
    fx.scanlines ||
    fx.vignette ||
    fx.floaties ||
    fx.cursorWarp ||
    fx.flashlight ||
    fx.clickGlitch;
  if (!hasAny) return null;

  return (
    <Animated.View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      {/* The shader is NOT here anymore: it renders as a backdrop BEHIND the
          app (ShaderBackdrop in the root layout). Only the translucent
          decorations stay on top. */}
      {fx.melt && (
        <MeltEffect
          intensity={meltIntensity}
          tempo={tempo}
          backdropColor={theme.colors.bgPrimary}
        />
      )}
      {fx.glitch && (
        <GlitchEffect factor={tempo.factor} accent={theme.colors.accent} />
      )}
      {fx.rainbow && <Rainbow factor={tempo.factor} />}
      {fx.swirl && (
        <Swirl width={width} height={height} factor={tempo.factor} />
      )}
      {fx.pulse && <Pulse color={theme.colors.accent} tempo={tempo} />}
      {fx.flicker && <Flicker />}
      {fx.scanlines && scanlineStyle && (
        <Animated.View style={[StyleSheet.absoluteFillObject, scanlineStyle, { opacity: 0.5 }]} />
      )}
      {fx.vignette && vignetteStyle && (
        <Animated.View style={[StyleSheet.absoluteFillObject, vignetteStyle]} />
      )}
      {(fx.cursorWarp || fx.flashlight || fx.clickGlitch) && (
        <PointerEffects
          warp={fx.cursorWarp}
          flashlight={fx.flashlight}
          clickGlitch={fx.clickGlitch}
          accent={theme.colors.accent}
          factor={tempo.factor}
          warpIntensity={warpIntensity}
          flashlightIntensity={flashlightIntensity}
          clickGlitchIntensity={clickGlitchIntensity}
        />
      )}
      {fx.floaties &&
        expandFloaties(fx.floaties).map((emoji, i) => (
          <Floatie
            key={`${theme.id}-${i}`}
            emoji={emoji}
            index={i + 1}
            width={width}
            height={height}
            factor={tempo.factor}
          />
        ))}
    </Animated.View>
  );
}
