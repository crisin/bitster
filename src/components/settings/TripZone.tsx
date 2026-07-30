import React, { useState } from "react";
import { Modal, Platform, StyleSheet, Text, View } from "react-native";
import { Chip } from "@/components/ui/Chip";
import { Pressable } from "@/components/ui/Pressable";
import { TRIP_PRESETS } from "@/theme/shader/advanced";
import { useCurrentLook, useThemeStore } from "@/theme/store";
import { createThemedStyles } from "@/theme/themedStyles";
import { FONT, LABEL_STYLE, RADIUS, SPACE } from "@/utils/constants";
import { IntensityRow } from "./ThemeEditor";
import { ShaderStudio } from "./ShaderStudio";

/**
 * The advanced-effects zone, behind an explicit yes. The gate is not
 * decoration: these presets flash, strobe and run the GPU hot — both worth
 * a conscious decision, once, persisted.
 */
export function TripZone() {
  const styles = useStyles();
  const tripMode = useThemeStore((s) => s.tripMode);
  const setTripMode = useThemeStore((s) => s.setTripMode);
  const look = useCurrentLook();
  const updateLookEffects = useThemeStore((s) => s.updateLookEffects);
  const setLookIntensity = useThemeStore((s) => s.setLookIntensity);
  const simSpeedDial = useThemeStore((s) => s.simSpeedDial);
  const simDensityDial = useThemeStore((s) => s.simDensityDial);
  const simScaleDial = useThemeStore((s) => s.simScaleDial);
  const setSimDial = useThemeStore((s) => s.setSimDial);
  const reseedSims = useThemeStore((s) => s.reseedSims);
  const [asking, setAsking] = useState(false);

  if (Platform.OS !== "web") {
    return (
      <Text style={styles.hint}>
        The trip runs on WebGL — play the web version to come along.
      </Text>
    );
  }

  if (!tripMode) {
    return (
      <View style={styles.teaser}>
        <Text style={styles.teaserEmoji}>🌀</Text>
        <Text style={styles.teaserText}>
          Multi-pass shaders. Video feedback. Reaction-diffusion, SmoothLife
          and Lenia colonies. Folded and raymarched fractals. Your own GLSL
          editor.
        </Text>
        <Pressable
          onPress={() => setAsking(true)}
          label="Open the advanced effects gate"
          style={styles.tripBtn}
        >
          <Text style={styles.tripBtnText}>🚀 Advanced effects</Text>
        </Pressable>

        <Modal
          visible={asking}
          transparent
          animationType="fade"
          onRequestClose={() => setAsking(false)}
        >
          <View style={styles.backdrop}>
            <View style={styles.dialog}>
              <Text style={styles.dialogTitle}>Kommste mit aufn Trip?</Text>
              <Text style={styles.dialogBody}>
                Fair warning: this side flashes, strobes and wobbles hard —
                if flashing lights are a problem for you, stay out. Also your
                GPU is going to run warm. That's the point.
              </Text>
              <View style={styles.dialogButtons}>
                <Pressable
                  onPress={() => setAsking(false)}
                  label="No thanks, stay sober"
                  style={styles.noBtn}
                >
                  <Text style={styles.noText}>mimimi</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setTripMode(true);
                    setAsking(false);
                  }}
                  label="Yes, enable advanced effects"
                  style={styles.yesBtn}
                >
                  <Text style={styles.yesText}>ABFAHRT</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  const activeTrip = TRIP_PRESETS.find((p) => p.id === look.effects.shader);

  return (
    <View style={styles.zone}>
      <Text style={styles.sectionTitle}>Trip presets</Text>
      <View style={styles.chipRow}>
        {TRIP_PRESETS.map((preset) => (
          <Chip
            key={preset.id}
            label={preset.label}
            selected={look.effects.shader === preset.id}
            onPress={() =>
              updateLookEffects({
                shader: look.effects.shader === preset.id ? "" : preset.id,
              })
            }
          />
        ))}
      </View>
      <Text style={styles.blurb}>
        {activeTrip
          ? activeTrip.blurb
          : "Applies to the current theme, like every other effect. All four follow your mouse/finger — click around. If it stutters, drop the shader quality (System tab)."}
      </Text>

      {activeTrip && (
        <IntensityRow
          title="Shader intensity"
          low="🫧"
          high="💥"
          value={look.shaderIntensity}
          onChange={(v) => setLookIntensity("shaderIntensity", v)}
        />
      )}

      {/* The lab bench — simulations have physics to tune, and user shaders
          get the dials too since the Studio documents u_sim */}
      {(activeTrip?.sim || look.effects.shader.startsWith("user:")) && (
        <View style={styles.simBench}>
          <Text style={styles.sectionTitle}>Sim tuning</Text>
          <IntensityRow
            title="Speed"
            low="🐌"
            high="⚡"
            value={simSpeedDial}
            onChange={(v) => setSimDial("simSpeedDial", v)}
          />
          <IntensityRow
            title="Zoom"
            low="🔬"
            high="🔭"
            value={simScaleDial}
            onChange={(v) => setSimDial("simScaleDial", v)}
          />
          <IntensityRow
            title="Seed density"
            low="🌵"
            high="🌴"
            value={simDensityDial}
            onChange={(v) => setSimDial("simDensityDial", v)}
          />
          <Pressable
            onPress={reseedSims}
            label="Restart the simulation with a fresh seed"
            style={styles.reseedBtn}
          >
            <Text style={styles.reseedText}>🌱 Reseed the dish</Text>
          </Pressable>
          <Text style={styles.hint}>
            Speed and zoom are live; seed density kicks in at the next
            reseed.
          </Text>
        </View>
      )}

      <ShaderStudio />

      <Pressable
        onPress={() => setTripMode(false)}
        label="Leave trip mode and clear advanced shaders"
        style={styles.leaveBtn}
      >
        <Text style={styles.leaveText}>
          🛬 End the trip (clears advanced shaders)
        </Text>
      </Pressable>
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) =>
  StyleSheet.create({
    hint: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
      opacity: 0.8,
    },
    teaser: {
      alignItems: "center",
      gap: SPACE.md,
      padding: SPACE.xl,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgCard,
    },
    teaserEmoji: {
      fontSize: 40,
    },
    teaserText: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
      textAlign: "center",
      lineHeight: 20,
    },
    tripBtn: {
      minHeight: 44,
      paddingHorizontal: SPACE.xl,
      borderRadius: RADIUS.md,
      borderWidth: 2,
      borderColor: COLORS.accent,
      backgroundColor: COLORS.accentLight,
      alignItems: "center",
      justifyContent: "center",
    },
    tripBtnText: {
      fontSize: FONT.size.md,
      fontWeight: FONT.weight.bold,
      color: COLORS.accent,
      letterSpacing: 1,
    },
    backdrop: {
      flex: 1,
      backgroundColor: COLORS.overlay,
      alignItems: "center",
      justifyContent: "center",
      padding: SPACE.xl,
    },
    dialog: {
      width: "100%",
      maxWidth: 420,
      gap: SPACE.md,
      padding: SPACE.xl,
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: COLORS.accent,
      backgroundColor: COLORS.bgPrimary,
    },
    dialogTitle: {
      fontSize: FONT.size.xl,
      fontWeight: FONT.weight.bold,
      color: COLORS.textPrimary,
    },
    dialogBody: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
      lineHeight: 20,
    },
    dialogButtons: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: SPACE.md,
      marginTop: SPACE.sm,
    },
    noBtn: {
      minHeight: 44,
      paddingHorizontal: SPACE.lg,
      justifyContent: "center",
    },
    noText: {
      fontSize: FONT.size.base,
      color: COLORS.textSecondary,
    },
    yesBtn: {
      minHeight: 44,
      paddingHorizontal: SPACE.xl,
      borderRadius: RADIUS.md,
      backgroundColor: COLORS.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    yesText: {
      fontSize: FONT.size.md,
      fontWeight: FONT.weight.bold,
      color: COLORS.textInverse,
      letterSpacing: 2,
    },
    zone: {
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
    blurb: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
      lineHeight: 18,
    },
    leaveBtn: {
      minHeight: 40,
      justifyContent: "center",
      marginTop: SPACE.sm,
    },
    simBench: {
      gap: SPACE.xs,
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgCard,
    },
    reseedBtn: {
      minHeight: 40,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.success,
      alignItems: "center",
      justifyContent: "center",
      marginTop: SPACE.xs,
    },
    reseedText: {
      fontSize: FONT.size.sm,
      fontWeight: FONT.weight.bold,
      color: COLORS.success,
    },
    leaveText: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
      opacity: 0.7,
    },
  }),
);
