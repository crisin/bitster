import { useGamePulse } from "@/hooks/useGamePulse";
import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { resolveEffectTempo } from "./effectTempo";
import { ShaderLayer } from "./shader/ShaderLayer";
import { getShaderScale, getSimIterationScale } from "./shader/quality";
import { useCurrentLook, useThemeStore } from "./store";
import { useTheme } from "./themedStyles";

/**
 * The shader as a BACKDROP: mounted before the navigation stack, so the
 * whole effect world lives BEHIND the app. Screens paint a translucent veil
 * over it (look.ts/veilFor) and cards stay opaque — which is the actual
 * readability architecture: text never fights the shader, because between
 * them sits a surface. The old way (canvas blended on TOP of the UI) could
 * only ever trade "visible effect" against "readable text".
 */
export function ShaderBackdrop() {
  const theme = useTheme();
  const look = useCurrentLook();
  const shaderQualityId = useThemeStore((s) => s.shaderQualityId);
  const speedId = useThemeStore((s) => s.effectSpeedId);
  const bpm = useThemeStore((s) => s.effectBpm);
  const factor = useThemeStore((s) => s.effectFactor);
  const pulse = useGamePulse();
  const simSpeedDial = useThemeStore((s) => s.simSpeedDial);
  const simDensityDial = useThemeStore((s) => s.simDensityDial);
  const simScaleDial = useThemeStore((s) => s.simScaleDial);
  const reseedNonce = useThemeStore((s) => s.simReseedNonce);

  const tempo = useMemo(
    () => resolveEffectTempo(speedId, bpm, factor),
    [speedId, bpm, factor],
  );

  // Dials are stored 0..1; speed and zoom map exponentially so the middle
  // is exactly 1x and both ends reach a meaningful 0.5x/2x
  const sim = useMemo(
    () =>
      [
        Math.pow(2, (simSpeedDial - 0.5) * 2),
        simDensityDial,
        Math.pow(2, (simScaleDial - 0.5) * 2),
      ] as const,
    [simSpeedDial, simDensityDial, simScaleDial],
  );

  if (!look.effects.shader) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <ShaderLayer
        preset={look.effects.shader}
        accent={theme.colors.accent}
        intensity={look.shaderIntensity}
        renderScale={getShaderScale(shaderQualityId)}
        factor={tempo.factor}
        bpm={tempo.bpm}
        pulse={pulse}
        guard={look.shaderGuard}
        iterationScale={getSimIterationScale(shaderQualityId)}
        sim={sim}
        reseedNonce={reseedNonce}
      />
    </View>
  );
}
