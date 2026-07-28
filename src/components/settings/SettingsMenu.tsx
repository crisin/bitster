import React, { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router } from "expo-router";
import { Pressable } from "@/components/ui/Pressable";
import { Divider } from "@/components/ui/Divider";
import { useLookTweaked, useThemeStore } from "@/theme/store";
import { THEMES } from "@/theme/themes";
import { resolveTheme } from "@/theme/look";
import { createThemedStyles, useTheme } from "@/theme/themedStyles";
import { ThemeEditor } from "./ThemeEditor";
import { EffectSettings } from "./EffectSettings";
import { TextSettings } from "./TextSettings";
import { TripZone } from "./TripZone";
import { FONT, RADIUS, SPACE, LABEL_STYLE } from "@/utils/constants";

type Tab = "look" | "trip" | "system";

const TABS: { id: Tab; label: string }[] = [
  { id: "look", label: "🎨 Look" },
  { id: "trip", label: "🚀 Trip" },
  { id: "system", label: "⚙️ System" },
];

/**
 * Always-available settings behind the floating gear. Three tabs instead of
 * the old two-column wall: Look (themes as presets + the per-theme editor),
 * Trip (the gated advanced zone) and System (device-wide dials). Everything
 * applies instantly — the sheet stays open so you can flip through looks live.
 */
export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("look");
  const themeId = useThemeStore((s) => s.themeId);
  const setTheme = useThemeStore((s) => s.setTheme);
  const looks = useThemeStore((s) => s.looks);
  const tweaked = useLookTweaked();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  // Past this the sheet floats as a centred panel instead of a bottom sheet
  const wide = width >= 700;
  const styles = useStyles();

  const allThemes = [...THEMES, resolveTheme("custom", looks["custom"])];

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
          <View style={[styles.sheet, wide && styles.sheetWide]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Settings</Text>
              <Text style={styles.sheetHint} numberOfLines={1}>
                {theme.emoji} {theme.name}
                {tweaked ? " (tweaked)" : ""}
              </Text>
              <Pressable
                onPress={() => setOpen(false)}
                label="Close settings"
                style={styles.closeBtn}
              >
                <Text style={styles.closeIcon}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.tabRow}>
              {TABS.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => setTab(t.id)}
                  label={`Open the ${t.id} settings tab`}
                  style={[styles.tab, tab === t.id && styles.tabActive]}
                >
                  <Text
                    style={[styles.tabText, tab === t.id && styles.tabTextActive]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listInner}
            >
              {tab === "look" && (
                <>
                  <Text style={styles.groupTitle}>
                    Every theme is a preset — switch, tweak anything below,
                    reset any time.
                  </Text>
                  <View style={styles.themeGrid}>
                    {allThemes.map((t) => {
                      const selected = t.id === themeId;
                      const isTweaked = t.id in looks;
                      return (
                        <Pressable
                          key={t.id}
                          onPress={() => setTheme(t.id)}
                          label={`Switch to ${t.name} theme`}
                          style={[
                            styles.themeCard,
                            selected && styles.themeCardSelected,
                          ]}
                        >
                          <Text style={styles.themeEmoji}>{t.emoji}</Text>
                          <Text style={styles.themeName} numberOfLines={1}>
                            {t.name}
                            {isTweaked ? " ·" : ""}
                          </Text>
                          <View
                            style={[
                              styles.themeDot,
                              { backgroundColor: t.colors.accent },
                            ]}
                          />
                        </Pressable>
                      );
                    })}
                  </View>

                  <ThemeEditor />
                </>
              )}

              {tab === "trip" && <TripZone />}

              {tab === "system" && (
                <>
                  <EffectSettings />
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
                </>
              )}
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
      maxHeight: "88%",
      backgroundColor: COLORS.bgPrimary,
      borderTopLeftRadius: RADIUS.xl,
      borderTopRightRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: SPACE.xl,
      gap: SPACE.md,
      width: "100%",
      // One column with tabs — the old 1180px two-column layout was exactly
      // the "zu viel leere fläche" complaint
      maxWidth: 680,
      alignSelf: "center",
    },
    sheetWide: {
      borderRadius: RADIUS.xl,
      marginBottom: SPACE.xl,
      maxHeight: "92%",
    },
    sheetHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.md,
    },
    sheetTitle: {
      ...LABEL_STYLE,
      color: COLORS.textSecondary,
      fontSize: FONT.size.base,
    },
    sheetHint: {
      flex: 1,
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
      opacity: 0.8,
      textAlign: "right",
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
    tabRow: {
      flexDirection: "row",
      gap: SPACE.sm,
    },
    tab: {
      flex: 1,
      minHeight: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    tabActive: {
      borderColor: COLORS.accent,
      backgroundColor: COLORS.accentLight,
    },
    tabText: {
      ...LABEL_STYLE,
      color: COLORS.textSecondary,
    },
    tabTextActive: {
      color: COLORS.accent,
    },
    list: {
      flexGrow: 0,
    },
    listInner: {
      gap: SPACE.md,
      paddingVertical: SPACE.sm,
    },
    groupTitle: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
      lineHeight: 18,
    },
    themeGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: SPACE.sm,
    },
    themeCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.xs,
      paddingVertical: SPACE.xs,
      paddingHorizontal: SPACE.sm,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgCard,
      minHeight: 40,
    },
    themeCardSelected: {
      borderColor: COLORS.accent,
      backgroundColor: COLORS.bgElevated,
    },
    themeEmoji: {
      fontSize: FONT.size.md,
    },
    themeName: {
      fontSize: FONT.size.sm,
      fontWeight: FONT.weight.semibold,
      color: COLORS.textPrimary,
      maxWidth: 90,
    },
    themeDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: "rgba(127, 127, 127, 0.4)",
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
