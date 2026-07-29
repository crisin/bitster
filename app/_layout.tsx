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
import { hydrateTheme, useCurrentLook, useThemeStore } from "@/theme/store";
import { useTheme } from "@/theme/themedStyles";
import { ShaderBackdrop } from "@/theme/ShaderBackdrop";
import { ThemeOverlay } from "@/theme/ThemeOverlay";
import { FONT_ASSETS } from "@/theme/typography";
import { interceptConsole, log } from "@/utils/logger";
import { BebasNeue_400Regular, useFonts } from "@expo-google-fonts/bebas-neue";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";

export default function RootLayout() {
  // Non-blocking: the UI renders with the fallback font until loaded
  useFonts({ BebasNeue_400Regular, ...FONT_ASSETS });
  const theme = useTheme();
  // Shader behind, veil between: the readability architecture (see veilFor)
  const look = useCurrentLook();

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
    <>
      <StatusBar style={theme.statusBar} />
      <ShaderBackdrop />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: veilFor(theme, look) },
          animation: "fade",
        }}
      />
      <ThemeOverlay />
      <SettingsMenu />
      {isDev && <DevLogButton />}
    </>
  );
}
