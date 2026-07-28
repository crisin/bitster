import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { Slider } from "@/components/ui/Slider";
import { useThemeStore } from "@/theme/store";
import { ACCENT_PRESETS, normalizeHex, randomFloaties } from "@/theme/customTheme";
import { SHADER_PRESETS } from "@/theme/shader/presets";
import { createThemedStyles } from "@/theme/themedStyles";
import { FONT, RADIUS, SPACE, LABEL_STYLE } from "@/utils/constants";

/** Perceived-brightness check so the ✓ stays visible on any swatch */
function checkColorFor(hex: string): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#1a1a1a" : "#ffffff";
}

const EFFECT_OPTIONS = [
  { key: "glow", label: "Glow" },
  { key: "blur", label: "Frost" },
  { key: "pulse", label: "Pulse" },
  { key: "rainbow", label: "Rainbow" },
  { key: "swirl", label: "Swirl" },
  { key: "melt", label: "Melt 🫠" },
  { key: "glitch", label: "Glitch 📡" },
  { key: "flicker", label: "Flicker" },
  { key: "scanlines", label: "Scanlines" },
  { key: "vignette", label: "Vignette" },
] as const;

/** Cursor-driven effects — a touch screen has no pointer to follow */
const POINTER_OPTIONS = [
  {
    key: "cursorWarp",
    label: "Warp lens 🔮",
    setting: "warpIntensity",
    dial: "Lens size",
    low: "🔎",
    high: "🔮",
  },
  {
    key: "flashlight",
    label: "Flashlight 🔦",
    setting: "flashlightIntensity",
    dial: "Light radius",
    low: "🕯️",
    high: "🔦",
  },
  {
    key: "clickGlitch",
    label: "Click glitch ⚡",
    setting: "clickGlitchIntensity",
    dial: "Click punch",
    low: "😌",
    high: "⚡",
  },
] as const;

/** A labelled 0–100% dial, same shape as the melt slider */
function IntensityRow({
  title,
  low,
  high,
  value,
  onChange,
}: {
  title: string;
  low: string;
  high: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const styles = useStyles();
  return (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.meltRow}>
        <Text style={styles.meltEdge}>{low}</Text>
        <View style={styles.meltTrack}>
          <Slider
            value={value}
            min={0}
            max={1}
            step={0.05}
            onValueChange={onChange}
            label={title}
          />
        </View>
        <Text style={styles.meltEdge}>{high}</Text>
        <Text style={styles.meltValue}>{Math.round(value * 100)}%</Text>
      </View>
    </>
  );
}

/**
 * Editor for the user-defined theme: base mode, free accent color and
 * effect toggles. Every change applies (and persists) immediately.
 */
export function CustomThemeEditor() {
  const styles = useStyles();
  const custom = useThemeStore((s) => s.custom);
  const updateCustom = useThemeStore((s) => s.updateCustom);
  const updateCustomEffects = useThemeStore((s) => s.updateCustomEffects);
  const meltIntensity = useThemeStore((s) => s.meltIntensity);
  const setPointerIntensity = useThemeStore((s) => s.setPointerIntensity);
  const pointerIntensity = {
    warpIntensity: useThemeStore((s) => s.warpIntensity),
    flashlightIntensity: useThemeStore((s) => s.flashlightIntensity),
    clickGlitchIntensity: useThemeStore((s) => s.clickGlitchIntensity),
  };
  const setMeltIntensity = useThemeStore((s) => s.setMeltIntensity);
  const shaderIntensity = useThemeStore((s) => s.shaderIntensity);
  const setShaderIntensity = useThemeStore((s) => s.setShaderIntensity);

  const [hexDraft, setHexDraft] = useState(custom.accent);
  const hexValid = normalizeHex(hexDraft) !== null;

  // Keep the hex field in sync when a swatch is tapped
  useEffect(() => {
    setHexDraft(custom.accent);
  }, [custom.accent]);

  const handleHexChange = (value: string) => {
    setHexDraft(value);
    const normalized = normalizeHex(value);
    if (normalized) updateCustom({ accent: normalized });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Base</Text>
      <View style={styles.chipRow}>
        <Chip
          label="Dark"
          selected={custom.base === "dark"}
          onPress={() => updateCustom({ base: "dark" })}
        />
        <Chip
          label="Light"
          selected={custom.base === "light"}
          onPress={() => updateCustom({ base: "light" })}
        />
      </View>

      <Text style={styles.sectionTitle}>Accent color</Text>
      <View style={styles.swatchGrid}>
        {ACCENT_PRESETS.map((hex) => {
          const selected = hex === custom.accent;
          return (
            <Pressable
              key={hex}
              onPress={() => updateCustom({ accent: hex })}
              label={`Accent color ${hex}`}
              style={[
                styles.swatch,
                { backgroundColor: hex },
                selected && styles.swatchSelected,
              ]}
            >
              {selected && (
                <Text style={[styles.swatchCheck, { color: checkColorFor(hex) }]}>
                  ✓
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
      <Input
        placeholder="#ff6fae"
        label="Custom accent hex color"
        value={hexDraft}
        onChangeText={handleHexChange}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={7}
        error={hexValid ? undefined : "Hex color like #ff6fae"}
      />

      <Text style={styles.sectionTitle}>Effects</Text>
      <View style={styles.chipRow}>
        {EFFECT_OPTIONS.map((fx) => (
          <Chip
            key={fx.key}
            label={fx.label}
            selected={custom.effects[fx.key]}
            onPress={() =>
              updateCustomEffects({ [fx.key]: !custom.effects[fx.key] })
            }
          />
        ))}
      </View>

      {/* The shader layer paints its own world per pixel — web only for now */}
      {Platform.OS === "web" && (
        <>
          <Text style={styles.sectionTitle}>Shader layer</Text>
          <View style={styles.chipRow}>
            <Chip
              label="Off"
              selected={custom.effects.shader === ""}
              onPress={() => updateCustomEffects({ shader: "" })}
            />
            {SHADER_PRESETS.map((preset) => (
              <Chip
                key={preset.id}
                label={preset.label}
                selected={custom.effects.shader === preset.id}
                onPress={() => updateCustomEffects({ shader: preset.id })}
              />
            ))}
          </View>
          {custom.effects.shader !== "" && (
            <IntensityRow
              title="Shader intensity"
              low="🫧"
              high="💥"
              value={shaderIntensity}
              onChange={setShaderIntensity}
            />
          )}
        </>
      )}

      {/* Cursor effects — pointless without a pointer, so web only */}
      {Platform.OS === "web" && (
        <>
          <Text style={styles.sectionTitle}>Mouse & clicks</Text>
          <View style={styles.chipRow}>
            {POINTER_OPTIONS.map((fx) => (
              <Chip
                key={fx.key}
                label={fx.label}
                selected={custom.effects[fx.key]}
                onPress={() =>
                  updateCustomEffects({ [fx.key]: !custom.effects[fx.key] })
                }
              />
            ))}
          </View>
          {/* One dial per effect, shown only while that effect is on */}
          {POINTER_OPTIONS.filter((fx) => custom.effects[fx.key]).map((fx) => (
            <IntensityRow
              key={fx.key}
              title={fx.dial}
              low={fx.low}
              high={fx.high}
              value={pointerIntensity[fx.setting]}
              onChange={(v) => setPointerIntensity(fx.setting, v)}
            />
          ))}
        </>
      )}

      {/* Melt tuning lives right next to its toggle (web-only effect) */}
      {custom.effects.melt && Platform.OS === "web" && (
        <>
          <Text style={styles.sectionTitle}>Melt intensity</Text>
          <View style={styles.meltRow}>
            <Text style={styles.meltEdge}>🧊</Text>
            <View style={styles.meltTrack}>
              <Slider
                value={meltIntensity}
                min={0}
                max={1}
                step={0.05}
                onValueChange={setMeltIntensity}
                label="Melt intensity"
              />
            </View>
            <Text style={styles.meltEdge}>🫠</Text>
            <Text style={styles.meltValue}>
              {Math.round(meltIntensity * 100)}%
            </Text>
          </View>
        </>
      )}

      <View style={styles.floatieHeader}>
        <Text style={styles.sectionTitle}>Floating emojis</Text>
        <Pressable
          onPress={() => updateCustomEffects({ floaties: randomFloaties() })}
          label="Roll a random set of floating emojis"
          style={styles.diceBtn}
        >
          <Text style={styles.diceText}>🎲 Surprise me</Text>
        </Pressable>
      </View>
      <Input
        placeholder="🎵✨🔥 (empty = none)"
        label="Floating emojis"
        value={custom.effects.floaties}
        onChangeText={(value) => updateCustomEffects({ floaties: value })}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={16}
      />
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) =>
  StyleSheet.create({
    container: {
      gap: SPACE.sm,
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgElevated,
    },
    floatieHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: SPACE.sm,
    },
    diceBtn: {
      minHeight: 36,
      justifyContent: "center",
      paddingHorizontal: SPACE.sm,
    },
    diceText: {
      fontSize: FONT.size.sm,
      color: COLORS.accent,
      fontWeight: FONT.weight.bold,
    },
    sectionTitle: {
      ...LABEL_STYLE,
      color: COLORS.textSecondary,
      marginTop: SPACE.xs,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: SPACE.sm,
    },
    swatchGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: SPACE.sm,
    },
    swatch: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.full,
      borderWidth: 2,
      borderColor: "rgba(127, 127, 127, 0.35)",
      alignItems: "center",
      justifyContent: "center",
    },
    swatchSelected: {
      borderColor: COLORS.textPrimary,
    },
    swatchCheck: {
      fontSize: FONT.size.lg,
      fontWeight: FONT.weight.bold,
    },
    meltRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.sm,
    },
    meltTrack: {
      flex: 1,
    },
    meltEdge: {
      fontSize: FONT.size.base,
    },
    meltValue: {
      width: 44,
      textAlign: "right",
      fontSize: FONT.size.sm,
      fontWeight: FONT.weight.semibold,
      color: COLORS.accent,
      fontVariant: ["tabular-nums"],
    },
  }),
);
