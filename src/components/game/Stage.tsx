import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { DISPLAY_FONT, FONT, RADIUS, SPACE } from "@/utils/constants";
import { createThemedStyles } from "@/theme/themedStyles";

interface StageProps {
  /** Whose timeline is in the spotlight */
  title: string;
  /** Accent the frame (it's your own turn) */
  hot?: boolean;
  children: React.ReactNode;
}

/**
 * The spotlight panel holding the active player's timeline — the center of
 * attention while a song is being guessed and challenged.
 */
export function Stage({ title, hot = false, children }: StageProps) {
  const styles = useStyles();
  return (
    <View style={[styles.stage, hot && styles.stageHot]}>
      <View style={styles.marquee}>
        <Text style={styles.marqueeStar}>✦</Text>
        <Text style={[styles.marqueeText, hot && styles.marqueeHot]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.marqueeStar}>✦</Text>
      </View>
      {children}
    </View>
  );
}

const useStyles = createThemedStyles((COLORS, theme) => StyleSheet.create({
  stage: {
    width: "100%",
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(26, 35, 50, 0.55)",
    paddingVertical: SPACE.lg,
    gap: SPACE.sm,
  },
  stageHot: {
    borderColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
    ...(theme.effects.glow ? { shadowOpacity: 0.55, shadowRadius: 32 } : {}),
  },
  marquee: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
  },
  marqueeStar: {
    color: COLORS.yearText,
    fontSize: FONT.size.sm,
    opacity: 0.7,
  },
  marqueeText: {
    fontFamily: DISPLAY_FONT,
    fontSize: FONT.size["2xl"],
    letterSpacing: 3,
    color: COLORS.textPrimary,
    textTransform: "uppercase",
  },
  marqueeHot: {
    color: COLORS.accent,
  },
}));
