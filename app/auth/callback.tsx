import React, { useEffect, useRef, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Button } from "@/components/ui/Button";
import { useStreamingStore } from "@/streaming/store";
import { completePendingAuth } from "@/streaming/providers/spotify/auth";
import { log } from "@/utils/logger";
import { COLORS, FONT, SPACE } from "@/utils/constants";

// Popup flow (web): posts the result back to the opener window and closes
WebBrowser.maybeCompleteAuthSession();

const TIMEOUT_MS = 15_000;

/** True when this window is the auth popup — the opener finishes the login */
function isAuthPopup(): boolean {
  return (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    window.opener != null
  );
}

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{
    code?: string;
    state?: string;
    error?: string;
  }>();
  const authStatus = useStreamingStore((s) => s.authStatus);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const attempted = useRef(false);

  // Cold-start recovery: if no live login is in progress (the app was killed
  // during the browser hop, or this was a full-page redirect), finish the
  // exchange from the persisted auth session.
  useEffect(() => {
    if (isAuthPopup() || attempted.current) return;
    if (authStatus === "unauthenticated" && (params.code || params.error)) {
      attempted.current = true;
      completePendingAuth({
        code: params.code,
        state: params.state,
        error: params.error,
      })
        .then((result) => {
          if (result === "no-pending") {
            log.warn("auth-callback", "No pending login to complete");
            setErrorMessage(
              "This login link is no longer valid. Please connect again.",
            );
          }
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          setErrorMessage(`Spotify login failed: ${msg}`);
        });
    }
  }, [authStatus, params.code, params.state, params.error]);

  // Success (from this screen's exchange OR the still-running login()) → home
  useEffect(() => {
    if (!isAuthPopup() && authStatus === "authenticated") {
      router.replace("/");
    }
  }, [authStatus]);

  // Never hang on the spinner forever
  useEffect(() => {
    if (isAuthPopup()) return;
    const timer = setTimeout(() => {
      setErrorMessage((current) => {
        if (current) return current;
        if (useStreamingStore.getState().authStatus === "authenticated") {
          return current;
        }
        return "Login is taking too long. Please try again.";
      });
    }, TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  if (errorMessage) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>Connection failed</Text>
        <Text style={styles.errorText}>{errorMessage}</Text>
        <Button
          title="Back to Home"
          onPress={() => router.replace("/")}
          label="Go back to the home screen"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.accent} />
      <Text style={styles.text}>Connecting...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.lg,
    paddingHorizontal: SPACE["2xl"],
  },
  text: {
    color: COLORS.textSecondary,
    fontSize: FONT.size.lg,
  },
  errorTitle: {
    color: COLORS.error,
    fontSize: FONT.size["2xl"],
    fontWeight: FONT.weight.bold,
  },
  errorText: {
    color: COLORS.textSecondary,
    fontSize: FONT.size.base,
    textAlign: "center",
    lineHeight: 20,
  },
});
