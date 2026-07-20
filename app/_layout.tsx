import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts, BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import { interceptConsole, log } from "@/utils/logger";
import { DevLogButton } from "@/components/ui/DevLogButton";
import { SettingsMenu } from "@/components/settings/SettingsMenu";
import { initSpotify } from "@/streaming/providers/spotify";
import { hydrateTheme } from "@/theme/store";
import { ThemeOverlay } from "@/theme/ThemeOverlay";
import { useTheme } from "@/theme/themedStyles";
import { useGameStore } from "@/game/store";
import { useP2PStore } from "@/p2p/store";
import { useStreamingStore } from "@/streaming/store";

export default function RootLayout() {
  // Non-blocking: the UI renders with the fallback font until loaded
  useFonts({ BebasNeue_400Regular });
  const theme = useTheme();

  useEffect(() => {
    interceptConsole();
    initSpotify();
    void hydrateTheme();
    log.info("App", "Hitster started");
    if (__DEV__) {
      // Debug bridge: poke the stores from the browser console / e2e checks
      (globalThis as Record<string, unknown>).__hitsterStores = {
        game: useGameStore,
        p2p: useP2PStore,
        streaming: useStreamingStore,
      };
    }
    return () => {
      log.info("App", "Hitster unmounted");
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
