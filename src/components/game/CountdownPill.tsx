import { useP2PStore } from "@/p2p/store";
import { createThemedStyles } from "@/theme/themedStyles";
import { DISPLAY_FONT, FONT, RADIUS, SPACE } from "@/utils/constants";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

/** Seconds left until the deadline, ticking 4×/s for a smooth countdown */
export function useCountdown(deadline: number | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);
  // Deadlines are stamped with the HOST's clock. Without translating them into
  // ours, a device whose clock is off shows a wrong — possibly already
  // expired — countdown. The host's own offset is 0 by construction.
  const offset = useP2PStore((s) => s.clockOffsetMs);

  useEffect(() => {
    if (deadline == null) {
      setRemaining(null);
      return;
    }
    const localDeadline = deadline - offset;
    const tick = () => {
      setRemaining(Math.max(0, Math.ceil((localDeadline - Date.now()) / 1000)));
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [deadline, offset]);

  return remaining;
}

interface CountdownPillProps {
  /** Epoch-ms deadline (host clock) — corrected by clockOffsetMs; null hides the pill */
  deadline: number | null;
  /** Screen-reader phrasing, gets the remaining seconds prefixed */
  accessibilitySuffix?: string;
}

/**
 * Shared deadline pill for the buzz lock-in and the Blitz placement timer.
 * Turns urgent (red) on the last 5 seconds.
 */
export function CountdownPill({
  deadline,
  accessibilitySuffix = "seconds left",
}: CountdownPillProps) {
  const styles = useStyles();
  const remaining = useCountdown(deadline);
  if (remaining == null) return null;

  const urgent = remaining <= 5;
  return (
    <View
      style={[styles.countdown, urgent && styles.countdownUrgent]}
      accessibilityRole="timer"
      accessibilityLabel={`${remaining} ${accessibilitySuffix}`}
    >
      <Text style={[styles.countdownText, urgent && styles.countdownTextUrgent]}>
        {remaining}s
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) =>
  StyleSheet.create({
    countdown: {
      alignSelf: "center",
      paddingVertical: SPACE.xs,
      paddingHorizontal: SPACE.lg,
      borderRadius: RADIUS.full,
      borderWidth: 2,
      borderColor: COLORS.warning,
      backgroundColor: COLORS.warningLight,
    },
    countdownUrgent: {
      borderColor: COLORS.error,
      backgroundColor: COLORS.errorLight,
    },
    countdownText: {
      fontFamily: DISPLAY_FONT,
      fontSize: FONT.size["3xl"],
      color: COLORS.warning,
      letterSpacing: 1,
    },
    countdownTextUrgent: {
      color: COLORS.error,
    },
  }),
);
