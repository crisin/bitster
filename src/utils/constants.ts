export const COLORS = {
  bgPrimary: "#1a1a2e",
  bgCard: "#16213e",
  accent: "#e94560",
  secondary: "#0f3460",
  textPrimary: "#eeeeee",
  textSecondary: "#aaaaaa",
  border: "#2a2a4a",
  success: "#4ecdc4",
  error: "#e94560",
  spotify: "#1db954",
  warning: "#f0a500",
} as const;

export const SIZES = {
  touchMin: 48,
  gapTouchWidth: 56,
  gapTouchHeight: 80,
  buttonHeight: 52,
  headerHeight: 56,
  bottomBarHeight: 80,
  borderRadius: 8,
  borderRadiusLarge: 12,
  fontBody: 16,
  fontSmall: 12,
  fontTitle: 24,
  fontHuge: 32,
} as const;

export const MAX_RECONNECT_ATTEMPTS = 10;
export const RECONNECT_INTERVAL_MS = 3000;
