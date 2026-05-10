import React, { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { COLORS } from "@/utils/constants";

export default function CallbackScreen() {
  const params = useLocalSearchParams<{
    code?: string;
    error?: string;
  }>();

  useEffect(() => {
    if (params.error) {
      // TODO: handle auth error
      router.replace("/");
      return;
    }

    if (params.code) {
      // TODO: exchange code for token via streaming provider
      router.replace("/");
    }
  }, [params]);

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
