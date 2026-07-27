import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { Chip } from "@/components/ui/Chip";
import { useThemeStore } from "@/theme/store";
import { FONT_OPTIONS, FONT_SCALES } from "@/theme/typography";
import { createThemedStyles } from "@/theme/themedStyles";
import { FONT, RADIUS, SPACE, LABEL_STYLE } from "@/utils/constants";

/**
 * Text size + font family pickers. Sizes multiply on top of the device's
 * own text-size setting (native) or the browser's default font size (web),
 * so system accessibility settings keep working.
 */
export function TextSettings() {
  const styles = useStyles();
  const fontScaleId = useThemeStore((s) => s.fontScaleId);
  const fontId = useThemeStore((s) => s.fontId);
  const setFontScale = useThemeStore((s) => s.setFontScale);
  const setFont = useThemeStore((s) => s.setFont);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Text size</Text>
      <View style={styles.scaleRow}>
        {FONT_SCALES.map((s) => (
          <Chip
            key={s.id}
            label={s.name}
            selected={s.id === fontScaleId}
            onPress={() => setFontScale(s.id)}
          />
        ))}
      </View>
      <Text style={styles.hint}>
        Scales with your {Platform.OS === "web" ? "browser" : "device"} text
        settings on top.
      </Text>

      <Text style={[styles.sectionTitle, styles.fontTitle]}>Font</Text>
      <View style={styles.fontList}>
        {FONT_OPTIONS.map((f) => {
          const selected = f.id === fontId;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFont(f.id)}
              label={`Use ${f.name} font`}
              style={[styles.fontRow, selected && styles.fontRowSelected]}
            >
              <View style={styles.fontInfo}>
                <Text
                  style={[
                    styles.fontName,
                    f.regular != null && { fontFamily: f.regular },
                  ]}
                >
                  {f.name}
                </Text>
                <Text style={styles.fontTagline} numberOfLines={1}>
                  {f.tagline}
                </Text>
              </View>
              {selected && <Text style={styles.check}>✓</Text>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) =>
  StyleSheet.create({
    container: {
      gap: SPACE.sm,
    },
    sectionTitle: {
      ...LABEL_STYLE,
      color: COLORS.textSecondary,
    },
    fontTitle: {
      marginTop: SPACE.md,
    },
    scaleRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: SPACE.sm,
    },
    hint: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
      opacity: 0.8,
    },
    fontList: {
      gap: SPACE.sm,
    },
    fontRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.md,
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgCard,
    },
    fontRowSelected: {
      borderColor: COLORS.accent,
      backgroundColor: COLORS.bgElevated,
    },
    fontInfo: {
      flex: 1,
      gap: 1,
    },
    fontName: {
      fontSize: FONT.size.md,
      color: COLORS.textPrimary,
    },
    fontTagline: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
    },
    check: {
      fontSize: FONT.size.lg,
      color: COLORS.accent,
      fontWeight: FONT.weight.bold,
    },
  }),
);
