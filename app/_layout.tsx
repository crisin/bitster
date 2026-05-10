import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { COLORS } from "@/utils/constants";
import { interceptConsole, log } from "@/utils/logger";
import { DevLogButton } from "@/components/ui/DevLogButton";

export default function RootLayout() {
  useEffect(() => {
    interceptConsole();
    log.info("App", "Hitster started");
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
