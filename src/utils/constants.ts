export const COLORS = {
  bgPrimary: "#111827",
  bgCard: "#1a2332",
  accent: "#c9485b",
  secondary: "#1e3050",
  textPrimary: "#e2e4e8",
  textSecondary: "#7b8a9e",
  border: "#283548",
  success: "#3faa9e",
  error: "#c9485b",
  spotify: "#1db954",
  warning: "#c9903a",
  yearText: "#d4a574",
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
