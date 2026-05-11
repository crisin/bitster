import React, { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { COLORS } from "@/utils/constants";

WebBrowser.maybeCompleteAuthSession();

export default function AuthCallbackScreen() {
  useEffect(() => {
    // expo-auth-session handles the redirect automatically via maybeCompleteAuthSession above.
    // This screen is only visible briefly in the auth popup before it closes.
  }, []);

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
    gap: 16,
  },
  text: {
    color: COLORS.textSecondary,
    fontSize: 16,
  },
});
