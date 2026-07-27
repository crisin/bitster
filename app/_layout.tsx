import { SettingsMenu } from "@/components/settings/SettingsMenu";
import { DevLogButton } from "@/components/ui/DevLogButton";
import { useGameStore } from "@/game/store";
import { useP2PStore } from "@/p2p/store";
import { initSpotify } from "@/streaming/providers/spotify";
import { useStreamingStore } from "@/streaming/store";
import { hydrateTheme } from "@/theme/store";
import { useTheme } from "@/theme/themedStyles";
import { ThemeOverlay } from "@/theme/ThemeOverlay";
import { interceptConsole, log } from "@/utils/logger";
import { BebasNeue_400Regular, useFonts } from "@expo-google-fonts/bebas-neue";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";

export default function RootLayout() {
  // Non-blocking: the UI renders with the fallback font until loaded
  useFonts({ BebasNeue_400Regular });
  const theme = useTheme();

  useEffect(() => {
    interceptConsole();
    initSpotify();
    void hydrateTheme();
    log.info("App", "bitster started");
    if (__DEV__) {
      // Debug bridge: poke the stores from the browser console / e2e checks
      (globalThis as Record<string, unknown>).__bitsterStores = {
        game: useGameStore,
        p2p: useP2PStore,
        streaming: useStreamingStore,
      };
    }
    return () => {
      log.info("App", "bitster unmounted");
    };
  }, []);

  const isDev = __DEV__;

  return (
    <>
      <StatusBar style={theme.statusBar} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.bgPrimary },
          animation: "fade",
        }}
      />
      <ThemeOverlay />
      <SettingsMenu />
      {isDev && <DevLogButton />}
    </>
  );
}
