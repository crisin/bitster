import React, { useState } from "react";
import { View, Text, Modal, ScrollView, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Pressable } from "@/components/ui/Pressable";
import { Divider } from "@/components/ui/Divider";
import { useThemeStore } from "@/theme/store";
import { THEMES } from "@/theme/themes";
import { CUSTOM_THEME_ID, buildCustomTheme } from "@/theme/customTheme";
import { createThemedStyles, useTheme } from "@/theme/themedStyles";
import { CustomThemeEditor } from "./CustomThemeEditor";
import { TextSettings } from "./TextSettings";
import { FONT, RADIUS, SPACE, LABEL_STYLE } from "@/utils/constants";

/**
 * Always-available settings: a floating gear that opens themes, the custom
 * theme editor and text settings. Everything applies instantly — the sheet
 * stays open so you can flip through the looks live.
 */
export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const themeId = useThemeStore((s) => s.themeId);
  const setTheme = useThemeStore((s) => s.setTheme);
  const custom = useThemeStore((s) => s.custom);
  const theme = useTheme();
  const styles = useStyles();

  const customPreview = buildCustomTheme(custom);
  const allThemes = [...THEMES, customPreview];

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        label="Open settings"
        style={styles.gearButton}
      >
        <Text style={styles.gearIcon}>⚙</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Settings</Text>
              <Pressable
                onPress={() => setOpen(false)}
                label="Close settings"
                style={styles.closeBtn}
              >
                <Text style={styles.closeIcon}>✕</Text>
              </Pressable>
            </View>
            <Text style={styles.sheetHint}>
              Current: {theme.emoji} {theme.name} — tap around, it applies live
            </Text>

            <ScrollView style={styles.list} contentContainerStyle={styles.listInner}>
              <Text style={styles.groupTitle}>Theme</Text>
              {allThemes.map((t) => {
                const selected = t.id === themeId;
                return (
                  <React.Fragment key={t.id}>
                    <Pressable
                      onPress={() => setTheme(t.id)}
                      label={`Switch to ${t.name} theme`}
                      style={[styles.themeRow, selected && styles.themeRowSelected]}
                    >
                      <Text style={styles.themeEmoji}>{t.emoji}</Text>
                      <View style={styles.themeInfo}>
                        <Text style={styles.themeName}>{t.name}</Text>
                        <Text style={styles.themeTagline} numberOfLines={1}>
                          {t.tagline}
                        </Text>
                      </View>
                      <View style={styles.swatches}>
                        {[t.colors.bgPrimary, t.colors.accent, t.colors.warning].map(
                          (c, i) => (
                            <View
                              key={i}
                              style={[styles.swatch, { backgroundColor: c }]}
                            />
                          ),
                        )}
                      </View>
                      {selected && <Text style={styles.check}>✓</Text>}
                    </Pressable>
                    {t.id === CUSTOM_THEME_ID && themeId === CUSTOM_THEME_ID && (
                      <CustomThemeEditor />
                    )}
                  </React.Fragment>
                );
              })}

              <Divider />
              <TextSettings />

              <Divider />
              <Pressable
                onPress={() => {
                  setOpen(false);
                  router.push("/about");
                }}
                label="Open info and licenses"
                style={styles.aboutBtn}
              >
                <Text style={styles.aboutLink}>ℹ️  Info & Licenses</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const useStyles = createThemedStyles((COLORS) =>
  StyleSheet.create({
    gearButton: {
      position: "absolute",
      bottom: 100,
      left: SPACE.lg,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: COLORS.bgCard,
      borderWidth: 1,
      borderColor: COLORS.border,
      alignItems: "center",
      justifyContent: "center",
      opacity: 0.85,
      zIndex: 40,
      elevation: 6,
    },
    gearIcon: {
      fontSize: 20,
      color: COLORS.textSecondary,
    },
    backdrop: {
      flex: 1,
      backgroundColor: COLORS.overlay,
      justifyContent: "flex-end",
    },
    sheet: {
      maxHeight: "85%",
      backgroundColor: COLORS.bgPrimary,
      borderTopLeftRadius: RADIUS.xl,
      borderTopRightRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: SPACE.xl,
      gap: SPACE.sm,
    },
    sheetHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sheetTitle: {
      ...LABEL_STYLE,
      color: COLORS.textSecondary,
      fontSize: FONT.size.base,
    },
    closeBtn: {
      minWidth: 36,
      minHeight: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    closeIcon: {
      fontSize: FONT.size.lg,
      color: COLORS.textSecondary,
    },
    sheetHint: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
      opacity: 0.8,
    },
    list: {
      flexGrow: 0,
    },
    listInner: {
      gap: SPACE.sm,
      paddingVertical: SPACE.sm,
    },
    groupTitle: {
      ...LABEL_STYLE,
      color: COLORS.textSecondary,
    },
    themeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.md,
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgCard,
    },
    themeRowSelected: {
      borderColor: COLORS.accent,
      backgroundColor: COLORS.bgElevated,
    },
    themeEmoji: {
      fontSize: FONT.size["2xl"],
    },
    themeInfo: {
      flex: 1,
      gap: 1,
    },
    themeName: {
      fontSize: FONT.size.md,
      fontWeight: FONT.weight.semibold,
      color: COLORS.textPrimary,
    },
    themeTagline: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
    },
    swatches: {
      flexDirection: "row",
      gap: 4,
    },
    swatch: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: "rgba(127, 127, 127, 0.4)",
    },
    check: {
      fontSize: FONT.size.lg,
      color: COLORS.accent,
      fontWeight: FONT.weight.bold,
    },
    aboutBtn: {
      minHeight: 40,
      justifyContent: "center",
    },
    aboutLink: {
      fontSize: FONT.size.base,
      color: COLORS.textSecondary,
      textAlign: "center",
    },
  }),
);
