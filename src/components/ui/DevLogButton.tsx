import React, { useState } from "react";
import { TouchableOpacity, Text, StyleSheet, Alert, Platform } from "react-native";
import { log } from "@/utils/logger";
import { COLORS } from "@/utils/constants";

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
    <TouchableOpacity
      onPress={handlePress}
      disabled={exporting}
      activeOpacity={0.7}
      style={[styles.button, exporting && styles.disabled]}
    >
      <Text style={styles.text}>{exporting ? "..." : "📋"}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    bottom: 100,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
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
    fontSize: 18,
  },
});
