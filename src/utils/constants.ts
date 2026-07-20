// ─── Color Palette ───────────────────────────────────────────────
export const COLORS = {
  // Backgrounds
  bgPrimary: "#111827",
  bgCard: "#1a2332",
  bgElevated: "#1e2940",

  // Borders
  border: "#283548",
  borderFocused: "#c9485b",

  // Text
  textPrimary: "#e2e4e8",
  textSecondary: "#7b8a9e",
  textInverse: "#111827",
  white: "#ffffff",

  // Semantic
  accent: "#c9485b",
  accentLight: "rgba(201, 72, 91, 0.12)",
  secondary: "#1e3050",
  success: "#3faa9e",
  successLight: "rgba(63, 170, 158, 0.12)",
  error: "#c9485b",
  errorLight: "rgba(239, 68, 68, 0.1)",
  warning: "#c9903a",
  warningLight: "rgba(201, 144, 58, 0.12)",

  // Brand
  spotify: "#1db954",

  // Game-specific
  yearText: "#d4a574",

  // Overlay
  overlay: "rgba(0, 0, 0, 0.5)",
  transparent: "transparent",
} as const;

// ─── Spacing Scale (4px base unit) ──────────────────────────────
export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
} as const;

// ─── Typography ─────────────────────────────────────────────────
/**
 * Display font for years, headings, stamps (loaded in app/_layout.tsx).
 * Falls back to the system font until loaded — same metrics-ish, no layout jump
 * worth guarding against.
 */
export const DISPLAY_FONT = "BebasNeue_400Regular";

export const FONT = {
  size: {
    xs: 11,
    sm: 12,
    base: 14,
    md: 15,
    lg: 16,
    xl: 18,
    "2xl": 22,
    "3xl": 24,
    "4xl": 28,
    "5xl": 32,
    "6xl": 36,
  },
  weight: {
    normal: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    extrabold: "800" as const,
    black: "900" as const,
  },
  tracking: {
    tight: -0.5,
    normal: 0,
    wide: 0.5,
    wider: 1,
    widest: 2,
  },
} as const;

// ─── Border Radius ──────────────────────────────────────────────
export const RADIUS = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
} as const;

// ─── Interaction / Touch ────────────────────────────────────────
export const TOUCH = {
  minHeight: 48,
  minWidth: 48,
  hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
  activeOpacity: 0.7,
} as const;

// ─── Layout ─────────────────────────────────────────────────────
export const LAYOUT = {
  headerHeight: 56,
  bottomBarHeight: 80,
  maxContentWidth: 480,
  cardMaxWidth: 360,
  buttonHeight: 52,
  inputHeight: 52,
} as const;

// ─── Shared label style (uppercase section titles) ──────────────
export const LABEL_STYLE = {
  fontSize: FONT.size.sm,
  fontWeight: FONT.weight.semibold,
  color: COLORS.textSecondary,
  textTransform: "uppercase" as const,
  letterSpacing: FONT.tracking.wider,
};

// ─── Legacy aliases (backward compat) ───────────────────────────
export const SIZES = {
  touchMin: TOUCH.minHeight,
  gapTouchWidth: 56,
  gapTouchHeight: 80,
  buttonHeight: LAYOUT.buttonHeight,
  headerHeight: LAYOUT.headerHeight,
  bottomBarHeight: LAYOUT.bottomBarHeight,
  borderRadius: RADIUS.md,
  borderRadiusLarge: RADIUS.lg,
  fontBody: FONT.size.lg,
  fontSmall: FONT.size.sm,
  fontTitle: FONT.size["3xl"],
  fontHuge: FONT.size["5xl"],
} as const;

// ─── App constants ──────────────────────────────────────────────
export const MAX_RECONNECT_ATTEMPTS = 10;
export const RECONNECT_INTERVAL_MS = 3000;
