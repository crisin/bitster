import { SettingsMenu } from "@/components/settings/SettingsMenu";
import { DevLogButton } from "@/components/ui/DevLogButton";
import { useGameStore } from "@/game/store";
import { accountIdentity } from "@/history/identity";
import { useHistoryStore } from "@/history/store";
import { useP2PStore } from "@/p2p/store";
import { initSpotify } from "@/streaming/providers/spotify";
import { useStreamingStore } from "@/streaming/store";
import { useShaderStudioStore } from "@/theme/shader/studio";
import { veilFor } from "@/theme/look";
import { hydrateTheme, useThemeStore } from "@/theme/store";
import { presetLookFor } from "@/theme/look";
import { useTheme } from "@/theme/themedStyles";
import { ShaderBackdrop } from "@/theme/ShaderBackdrop";
import { ThemeOverlay } from "@/theme/ThemeOverlay";
import { FONT_ASSETS } from "@/theme/typography";
import { interceptConsole, log } from "@/utils/logger";
import { BebasNeue_400Regular, useFonts } from "@expo-google-fonts/bebas-neue";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo } from "react";
import { Platform } from "react-native";

/**
 * React-navigation paints every screen WRAPPER with its nav theme's
 * background — an OPAQUE layer that sits between our translucent veil
 * (contentStyle) and the shader canvas behind the stack. Without making it
 * transparent the backdrop architecture is a lie: the canvas renders, the
 * veil is translucent, and an invisible #f2f2f2 wall between them swallows
 * everything.
 */
const NAV_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: "transparent",
    card: "transparent",
  },
};

export default function RootLayout() {
  // Non-blocking: the UI renders with the fallback font until loaded
  useFonts({ BebasNeue_400Regular, ...FONT_ASSETS });
  const theme = useTheme();
  // Shader behind, veil between (see veilFor). Deliberately NARROW
  // selectors: subscribing to the whole look here would re-render the
  // navigator on every intensity-slider step.
  // Web-only: on native the ShaderLayer is a stub, so screens must stay
  // opaque — a translucent veil there would show the bare root view.
  const shaderOn = useThemeStore(
    (s) =>
      Platform.OS === "web" &&
      Boolean((s.looks[s.themeId] ?? presetLookFor(s.themeId)).effects.shader),
  );
  const shaderGuard = useThemeStore(
    (s) => (s.looks[s.themeId] ?? presetLookFor(s.themeId)).shaderGuard,
  );
  const screenOptions = useMemo(
    () => ({
      headerShown: false,
      contentStyle: { backgroundColor: veilFor(theme, shaderOn, shaderGuard) },
      animation: "fade" as const,
    }),
    [theme, shaderOn, shaderGuard],
  );

  useEffect(() => {
    interceptConsole();
    initSpotify();
    void hydrateTheme();
    void useShaderStudioStore.getState().hydrate();
    void useHistoryStore.getState().hydrate();
    log.info("App", "bitster started");
    if (__DEV__) {
      // Debug bridge: poke the stores from the browser console / e2e checks
      (globalThis as Record<string, unknown>).__bitsterStores = {
        game: useGameStore,
        p2p: useP2PStore,
        streaming: useStreamingStore,
        history: useHistoryStore,
        theme: useThemeStore,
        logs: log.getEntries,
      };
    }
    return () => {
      log.info("App", "bitster unmounted");
    };
  }, []);

  // History is keyed by the streaming account so it follows the player across
  // devices — but the id stays here. Orchestrating in the layout keeps the two
  // stores from having to know about each other.
  useEffect(() => {
    const adopt = (account: { id: string } | null, providerId: string | null) => {
      if (!account || !providerId) return;
      useHistoryStore
        .getState()
        .adoptIdentity(accountIdentity(providerId, account.id));
    };
    adopt(
      useStreamingStore.getState().account,
      useStreamingStore.getState().activeProviderId,
    );
    return useStreamingStore.subscribe((state) =>
      adopt(state.account, state.activeProviderId),
    );
  }, []);

  const isDev = __DEV__;

  return (
    <ThemeProvider value={NAV_THEME}>
      <StatusBar style={theme.statusBar} />
      <ShaderBackdrop />
      <Stack screenOptions={screenOptions} />
      <ThemeOverlay />
      <SettingsMenu />
      {isDev && <DevLogButton />}
    </ThemeProvider>
  );
}
