import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts, BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import { COLORS } from "@/utils/constants";
import { interceptConsole, log } from "@/utils/logger";
import { DevLogButton } from "@/components/ui/DevLogButton";
import { initSpotify } from "@/streaming/providers/spotify";
import { useGameStore } from "@/game/store";
import { useP2PStore } from "@/p2p/store";
import { useStreamingStore } from "@/streaming/store";

export default function RootLayout() {
  // Non-blocking: the UI renders with the fallback font until loaded
  useFonts({ BebasNeue_400Regular });

  useEffect(() => {
    interceptConsole();
    initSpotify();
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
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.bgPrimary },
          animation: "fade",
        }}
      />
      {isDev && <DevLogButton />}
    </>
  );
}
