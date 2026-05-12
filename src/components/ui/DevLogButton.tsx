import React, { useState } from "react";
import { Text, StyleSheet, Alert, Platform } from "react-native";
import { Pressable } from "./Pressable";
import { log } from "@/utils/logger";
import { COLORS, RADIUS, SPACE, FONT, TOUCH } from "@/utils/constants";

export function DevLogButton() {
  const [exporting, setExporting] = useState(false);

  const handlePress = async () => {
    const entries = log.getEntries();
    if (entries.length === 0) {
      if (Platform.OS === "web") {
        alert("No log entries to export.");
      } else {
        Alert.alert("Logs", "No log entries to export.");
      }
      return;
    }

    setExporting(true);
    try {
      await log.exportToFile();
    } catch (e) {
      log.error("DevLog", "Export failed", e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={exporting}
      label="Export debug logs"
      style={[styles.button, exporting && styles.disabled]}
    >
      <Text style={styles.text}>{exporting ? "..." : "📋"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    bottom: 100,
    right: SPACE.lg,
    width: TOUCH.minWidth,
    height: TOUCH.minHeight,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.3,
  },
  text: {
    fontSize: FONT.size.xl,
  },
});
