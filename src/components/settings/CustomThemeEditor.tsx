import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { useThemeStore } from "@/theme/store";
import { ACCENT_PRESETS, normalizeHex } from "@/theme/customTheme";
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
  { key: "flicker", label: "Flicker" },
  { key: "scanlines", label: "Scanlines" },
  { key: "vignette", label: "Vignette" },
] as const;

/**
 * Editor for the user-defined theme: base mode, free accent color and
 * effect toggles. Every change applies (and persists) immediately.
 */
export function CustomThemeEditor() {
  const styles = useStyles();
  const custom = useThemeStore((s) => s.custom);
  const updateCustom = useThemeStore((s) => s.updateCustom);
  const updateCustomEffects = useThemeStore((s) => s.updateCustomEffects);

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

      <Text style={styles.sectionTitle}>Floating emojis</Text>
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
  }),
);
