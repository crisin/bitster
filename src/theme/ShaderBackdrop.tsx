import { useGamePulse } from "@/hooks/useGamePulse";
import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { resolveEffectTempo } from "./effectTempo";
import { ShaderLayer } from "./shader/ShaderLayer";
import { getShaderScale } from "./shader/quality";
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

  const tempo = useMemo(
    () => resolveEffectTempo(speedId, bpm, factor),
    [speedId, bpm, factor],
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
      />
    </View>
  );
}
