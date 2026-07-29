import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { Slider } from "@/components/ui/Slider";
import {
  useCurrentLook,
  useLookTweaked,
  useThemeStore,
  type LookIntensityKey,
} from "@/theme/store";
import {
  ACCENT_PRESETS,
  CUSTOM_THEME_ID,
  normalizeHex,
  randomFloaties,
} from "@/theme/customTheme";
import { getTripPreset } from "@/theme/shader/advanced";
import { isShaderPresetId, SHADER_PRESETS } from "@/theme/shader/presets";
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

/**
 * Both exist because a loud effect layer can eat the preset's contrast:
 * a solid dark background and bright text win against almost any shader.
 */
const BACKGROUND_SWATCHES = [
  "#000000", // pure black — maximum contrast under any effect
  "#0a0a12",
  "#10131c",
  "#04060c",
  "#1c0433",
  "#170a10",
  "#12041f",
  "#fafafa",
];

const TEXT_SWATCHES = [
  "#ffffff",
  "#e8e6e3",
  "#fdf1ff",
  "#ffe8c8",
  "#9fe8ff",
  "#5dff5d",
  "#17191c",
];

/**
 * A compact color override row: Auto (= the preset decides), swatches, and a
 * free hex field. Shared by background and text color.
 */
function ColorRow({
  title,
  value,
  swatches,
  onChange,
}: {
  title: string;
  value: string | null;
  swatches: string[];
  onChange: (hex: string | null) => void;
}) {
  const styles = useStyles();
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);
  const valid = draft === "" || normalizeHex(draft) !== null;

  return (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.chipRow}>
        <Chip
          label="Auto"
          selected={value === null}
          onPress={() => onChange(null)}
        />
        {swatches.map((hex) => {
          const selected = hex === value;
          return (
            <Pressable
              key={hex}
              onPress={() => onChange(hex)}
              label={`${title} ${hex}`}
              style={[
                styles.smallSwatch,
                { backgroundColor: hex },
                selected && styles.swatchSelected,
              ]}
            >
              {selected && (
                <Text
                  style={[styles.smallCheck, { color: checkColorFor(hex) }]}
                >
                  ✓
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
      <Input
        placeholder="#hex (empty = auto)"
        label={`${title} hex value`}
        value={draft}
        onChangeText={(text) => {
          setDraft(text);
          if (text === "") onChange(null);
          const normalized = normalizeHex(text);
          if (normalized) onChange(normalized);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={7}
        error={valid ? undefined : "Hex color like #101018"}
      />
    </>
  );
}

/** A labelled 0–100% dial, shared by every intensity in the editor */
export function IntensityRow({
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
      <View style={styles.dialRow}>
        <Text style={styles.dialEdge}>{low}</Text>
        <View style={styles.dialTrack}>
          <Slider
            value={value}
            min={0}
            max={1}
            step={0.05}
            onValueChange={onChange}
            label={title}
          />
        </View>
        <Text style={styles.dialEdge}>{high}</Text>
        <Text style={styles.dialValue}>{Math.round(value * 100)}%</Text>
      </View>
    </>
  );
}

/**
 * The look editor — for EVERY theme, not just Custom. Themes are presets over
 * one config space (the same decision the game modes made): tweak any of them,
 * the tweak is stored per theme, and reset brings the preset back.
 */
export function ThemeEditor() {
  const styles = useStyles();
  const themeId = useThemeStore((s) => s.themeId);
  const look = useCurrentLook();
  const tweaked = useLookTweaked();
  const updateLook = useThemeStore((s) => s.updateLook);
  const updateLookEffects = useThemeStore((s) => s.updateLookEffects);
  const setLookIntensity = useThemeStore((s) => s.setLookIntensity);
  const resetLook = useThemeStore((s) => s.resetLook);

  const accentShown = look.accent ?? "";
  const [hexDraft, setHexDraft] = useState(accentShown);
  const hexValid = hexDraft === "" || normalizeHex(hexDraft) !== null;

  // Keep the hex field in sync when a swatch is tapped or the theme changes
  useEffect(() => {
    setHexDraft(accentShown);
  }, [accentShown, themeId]);

  const handleHexChange = (value: string) => {
    setHexDraft(value);
    const normalized = normalizeHex(value);
    if (normalized) updateLook({ accent: normalized });
  };

  const setIntensity = (key: LookIntensityKey) => (v: number) =>
    setLookIntensity(key, v);

  return (
    <View style={styles.container}>
      {/* The way back: forget every tweak, let the preset shine through */}
      {tweaked && (
        <Pressable
          onPress={resetLook}
          label="Reset this theme to its preset"
          style={styles.resetBtn}
        >
          <Text style={styles.resetText}>↺ Reset to preset</Text>
        </Pressable>
      )}

      {themeId === CUSTOM_THEME_ID && (
        <>
          <Text style={styles.sectionTitle}>Base</Text>
          <View style={styles.chipRow}>
            <Chip
              label="Dark"
              selected={look.base === "dark"}
              onPress={() => updateLook({ base: "dark" })}
            />
            <Chip
              label="Light"
              selected={look.base === "light"}
              onPress={() => updateLook({ base: "light" })}
            />
          </View>
        </>
      )}

      <Text style={styles.sectionTitle}>Accent color</Text>
      <View style={styles.swatchGrid}>
        {ACCENT_PRESETS.map((hex) => {
          const selected = hex === look.accent;
          return (
            <Pressable
              key={hex}
              onPress={() => updateLook({ accent: hex })}
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
        placeholder="Preset accent — or your own hex"
        label="Custom accent hex color"
        value={hexDraft}
        onChangeText={handleHexChange}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={7}
        error={hexValid ? undefined : "Hex color like #ff6fae"}
      />

      {/* Contrast rescue: when the effects eat the UI, pin the surfaces */}
      <ColorRow
        title="Background"
        value={look.background}
        swatches={BACKGROUND_SWATCHES}
        onChange={(hex) => updateLook({ background: hex })}
      />
      <ColorRow
        title="Text color"
        value={look.textColor}
        swatches={TEXT_SWATCHES}
        onChange={(hex) => updateLook({ textColor: hex })}
      />

      <Text style={styles.sectionTitle}>Effects</Text>
      <View style={styles.chipRow}>
        {EFFECT_OPTIONS.map((fx) => (
          <Chip
            key={fx.key}
            label={fx.label}
            selected={look.effects[fx.key]}
            onPress={() =>
              updateLookEffects({ [fx.key]: !look.effects[fx.key] })
            }
          />
        ))}
      </View>

      {look.effects.melt && Platform.OS === "web" && (
        <IntensityRow
          title="Melt intensity"
          low="🧊"
          high="🫠"
          value={look.meltIntensity}
          onChange={setIntensity("meltIntensity")}
        />
      )}

      {/* The shader layer paints its own world per pixel — web only for now */}
      {Platform.OS === "web" && (
        <>
          <Text style={styles.sectionTitle}>Shader layer</Text>
          <View style={styles.chipRow}>
            <Chip
              label="Off"
              selected={look.effects.shader === ""}
              onPress={() => updateLookEffects({ shader: "" })}
            />
            {SHADER_PRESETS.map((preset) => (
              <Chip
                key={preset.id}
                label={preset.label}
                selected={look.effects.shader === preset.id}
                onPress={() => updateLookEffects({ shader: preset.id })}
              />
            ))}
            {/* A trip/Studio shader lives on the Trip tab — without this chip
                the row would show NOTHING selected while one is running */}
            {look.effects.shader !== "" &&
              !isShaderPresetId(look.effects.shader) && (
                <Chip
                  label={`🚀 ${
                    getTripPreset(look.effects.shader)?.label ?? "Studio shader"
                  }`}
                  selected
                  onPress={() => {}}
                />
              )}
          </View>
          {look.effects.shader !== "" && (
            <>
              <IntensityRow
                title="Shader intensity"
                low="🫧"
                high="💥"
                value={look.shaderIntensity}
                onChange={setIntensity("shaderIntensity")}
              />
              {/* The answer to "I can't read anything": a tone-map that
                  compresses the shader's highlights under the UI */}
              <View style={styles.guardRow}>
                <Chip
                  label="🛡️ Keep text readable"
                  selected={look.shaderGuard}
                  onPress={() => updateLook({ shaderGuard: !look.shaderGuard })}
                />
                {!look.shaderGuard && (
                  <Text style={styles.guardHint}>raw output — good luck</Text>
                )}
              </View>
            </>
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
                selected={look.effects[fx.key]}
                onPress={() =>
                  updateLookEffects({ [fx.key]: !look.effects[fx.key] })
                }
              />
            ))}
          </View>
          {/* One dial per effect, shown only while that effect is on */}
          {POINTER_OPTIONS.filter((fx) => look.effects[fx.key]).map((fx) => (
            <IntensityRow
              key={fx.key}
              title={fx.dial}
              low={fx.low}
              high={fx.high}
              value={look[fx.setting]}
              onChange={setIntensity(fx.setting)}
            />
          ))}
        </>
      )}

      <View style={styles.floatieHeader}>
        <Text style={styles.sectionTitle}>Floating emojis</Text>
        <Pressable
          onPress={() => updateLookEffects({ floaties: randomFloaties() })}
          label="Roll a random set of floating emojis"
          style={styles.diceBtn}
        >
          <Text style={styles.diceText}>🎲 Surprise me</Text>
        </Pressable>
      </View>
      <Input
        placeholder="🎵✨🔥 (empty = none)"
        label="Floating emojis"
        value={look.effects.floaties}
        onChangeText={(value) => updateLookEffects({ floaties: value })}
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
    resetBtn: {
      alignSelf: "flex-end",
      minHeight: 32,
      justifyContent: "center",
      paddingHorizontal: SPACE.sm,
    },
    resetText: {
      fontSize: FONT.size.sm,
      color: COLORS.warning,
      fontWeight: FONT.weight.bold,
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
    guardRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.sm,
    },
    guardHint: {
      fontSize: FONT.size.xs,
      color: COLORS.warning,
      opacity: 0.9,
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
    smallSwatch: {
      width: 32,
      height: 32,
      borderRadius: RADIUS.full,
      borderWidth: 2,
      borderColor: "rgba(127, 127, 127, 0.35)",
      alignItems: "center",
      justifyContent: "center",
    },
    smallCheck: {
      fontSize: FONT.size.sm,
      fontWeight: FONT.weight.bold,
    },
    swatchCheck: {
      fontSize: FONT.size.lg,
      fontWeight: FONT.weight.bold,
    },
    dialRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.sm,
    },
    dialTrack: {
      flex: 1,
    },
    dialEdge: {
      fontSize: FONT.size.base,
    },
    dialValue: {
      width: 44,
      textAlign: "right",
      fontSize: FONT.size.sm,
      fontWeight: FONT.weight.semibold,
      color: COLORS.accent,
      fontVariant: ["tabular-nums"],
    },
  }),
);
