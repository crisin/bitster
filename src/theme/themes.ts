import { COLORS } from "@/utils/constants";
import type { ShaderPresetId } from "./shader/presets";

/** Same shape as the classic palette — every theme swaps all of these */
export type ThemeColors = { [K in keyof typeof COLORS]: string };

export interface ThemeEffects {
  /** Accent glow shadows on cards, buttons and the stage */
  glow: boolean;
  /** Translucent "frosted" surfaces (web adds backdrop blur) */
  blur: boolean;
  /** Subtle brightness flicker, like a worn projector */
  flicker: boolean;
  /** Horizontal CRT/film scanlines (web only) */
  scanlines: boolean;
  /** Darkened corners (web only) */
  vignette: boolean;
  /** Slow animated rainbow wash over everything */
  rainbow: boolean;
  /** Pulsing accent-colored ambient light */
  pulse: boolean;
  /** Rotating psychedelic color swirl (web only) */
  swirl: boolean;
  /** The whole UI liquefies via SVG displacement (web only, not Safari) */
  melt: boolean;
  /** "Bad reception": random tear bars + screen jitter bursts */
  glitch: boolean;
  /** Emojis floating up the screen, null = none */
  floaties: string[] | null;
  /** Glass lens that bends whatever is under the cursor (web only) */
  cursorWarp: boolean;
  /** Everything goes dark except a circle around the cursor (web only) */
  flashlight: boolean;
  /** Tear-bar burst on every click (web only) */
  clickGlitch: boolean;
  /** Full-screen fragment shader preset, null = none (web only) */
  shader: ShaderPresetId | null;
}

export interface Theme {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  colors: ThemeColors;
  effects: ThemeEffects;
  /** Status bar content color — "dark" for light backgrounds */
  statusBar: "light" | "dark";
  /** Selecting this theme also switches to this font (user can re-change) */
  pairedFontId?: string;
}

const NO_EFFECTS: ThemeEffects = {
  glow: false,
  blur: false,
  flicker: false,
  scanlines: false,
  vignette: false,
  rainbow: false,
  pulse: false,
  swirl: false,
  melt: false,
  glitch: false,
  floaties: null,
  cursorWarp: false,
  flashlight: false,
  clickGlitch: false,
  shader: null,
};

export const DEFAULT_THEME_ID = "classic";

/** Shared by Trippy and its terminal-flavored sibling Tadi */
const TRIPPY_COLORS: ThemeColors = {
  ...COLORS,
  bgPrimary: "#1c0433",
  bgCard: "#2c0a4e",
  bgElevated: "#380f61",
  border: "#5b1e93",
  borderFocused: "#ff8a00",
  textPrimary: "#fdf1ff",
  textSecondary: "#c48ae0",
  accent: "#ff8a00",
  accentLight: "rgba(255, 138, 0, 0.14)",
  secondary: "#43127a",
  success: "#5dff5d",
  successLight: "rgba(93, 255, 93, 0.12)",
  error: "#ff3d81",
  errorLight: "rgba(255, 61, 129, 0.12)",
  warning: "#ffe600",
  warningLight: "rgba(255, 230, 0, 0.10)",
  yearText: "#5df3ff",
};

export const THEMES: Theme[] = [
  {
    id: "classic",
    name: "Classic",
    emoji: "🌙",
    tagline: "The original midnight look",
    colors: { ...COLORS },
    effects: { ...NO_EFFECTS },
    statusBar: "light",
  },
  {
    id: "minimal",
    name: "Minimal",
    emoji: "⬜",
    tagline: "Clean, quiet, ink on paper",
    colors: {
      ...COLORS,
      bgPrimary: "#fafafa",
      bgCard: "#ffffff",
      bgElevated: "#f0f1f3",
      border: "#e1e4e8",
      borderFocused: "#17191c",
      textPrimary: "#17191c",
      textSecondary: "#70777f",
      textInverse: "#fafafa",
      accent: "#17191c",
      accentLight: "rgba(23, 25, 28, 0.06)",
      secondary: "#2a2e33",
      success: "#2e7d64",
      successLight: "rgba(46, 125, 100, 0.10)",
      error: "#b3382c",
      errorLight: "rgba(179, 56, 44, 0.08)",
      warning: "#9a6a1f",
      warningLight: "rgba(154, 106, 31, 0.10)",
      yearText: "#8a5a2a",
      overlay: "rgba(0, 0, 0, 0.35)",
    },
    effects: { ...NO_EFFECTS },
    statusBar: "dark",
  },
  {
    id: "glassy",
    name: "Glassy",
    emoji: "🧊",
    tagline: "Frosted panes over deep water",
    colors: {
      ...COLORS,
      bgPrimary: "#0a1120",
      bgCard: "rgba(148, 187, 233, 0.09)",
      bgElevated: "rgba(148, 187, 233, 0.16)",
      border: "rgba(165, 200, 255, 0.28)",
      borderFocused: "#8fc7ff",
      textPrimary: "#eaf3ff",
      textSecondary: "#8fa8c9",
      accent: "#6db8ff",
      accentLight: "rgba(109, 184, 255, 0.14)",
      secondary: "rgba(109, 184, 255, 0.22)",
      success: "#5fd4c4",
      successLight: "rgba(95, 212, 196, 0.14)",
      warning: "#ffc46b",
      warningLight: "rgba(255, 196, 107, 0.14)",
      yearText: "#bcd8f7",
    },
    effects: { ...NO_EFFECTS, blur: true },
    statusBar: "light",
  },
  {
    id: "uwu",
    name: "UwU",
    emoji: "🌸",
    tagline: "Soft pastels and sparkles, nya~",
    colors: {
      ...COLORS,
      bgPrimary: "#fff0f6",
      bgCard: "#ffffff",
      bgElevated: "#ffe3ee",
      border: "#ffc9de",
      borderFocused: "#ff6fae",
      textPrimary: "#5c3a4d",
      textSecondary: "#b07f97",
      textInverse: "#fff0f6",
      accent: "#ff6fae",
      accentLight: "rgba(255, 111, 174, 0.12)",
      secondary: "#f79ac0",
      success: "#63c795",
      successLight: "rgba(99, 199, 149, 0.14)",
      error: "#f2637e",
      errorLight: "rgba(242, 99, 126, 0.12)",
      warning: "#f5a623",
      warningLight: "rgba(245, 166, 35, 0.14)",
      yearText: "#f2637e",
      overlay: "rgba(92, 58, 77, 0.4)",
    },
    effects: { ...NO_EFFECTS, floaties: ["💖", "✨", "🌸", "🎀", "🐾"] },
    statusBar: "dark",
  },
  {
    id: "neon",
    name: "NEON",
    emoji: "⚡",
    tagline: "Electric signs in a rainy alley",
    colors: {
      ...COLORS,
      bgPrimary: "#04060c",
      bgCard: "#0a0e1a",
      bgElevated: "#0e1426",
      border: "#1c2647",
      borderFocused: "#00f0ff",
      textPrimary: "#e8fbff",
      textSecondary: "#5f7d99",
      accent: "#00f0ff",
      accentLight: "rgba(0, 240, 255, 0.12)",
      secondary: "#131f4d",
      success: "#39ff8e",
      successLight: "rgba(57, 255, 142, 0.12)",
      error: "#ff2965",
      errorLight: "rgba(255, 41, 101, 0.12)",
      warning: "#ff00e5",
      warningLight: "rgba(255, 0, 229, 0.12)",
      yearText: "#f5d90a",
    },
    // Flickering neon signs get signal interference, obviously
    effects: { ...NO_EFFECTS, glow: true, glitch: true },
    statusBar: "light",
  },
  {
    id: "rave",
    name: "Rave",
    emoji: "🪩",
    tagline: "Strobes, bass and bad decisions",
    colors: {
      ...COLORS,
      bgPrimary: "#12041f",
      bgCard: "#1e0a35",
      bgElevated: "#280f45",
      border: "#4a1a70",
      borderFocused: "#c026ff",
      textPrimary: "#f7ecff",
      textSecondary: "#a678c9",
      accent: "#c026ff",
      accentLight: "rgba(192, 38, 255, 0.14)",
      secondary: "#3b1263",
      success: "#00ff9d",
      successLight: "rgba(0, 255, 157, 0.12)",
      error: "#ff2965",
      errorLight: "rgba(255, 41, 101, 0.12)",
      warning: "#faff00",
      warningLight: "rgba(250, 255, 0, 0.10)",
      yearText: "#ff9dfb",
    },
    effects: {
      ...NO_EFFECTS,
      glow: true,
      pulse: true,
      floaties: ["🪩", "🔊", "⚡", "🎉"],
    },
    statusBar: "light",
  },
  {
    id: "old-film",
    name: "Old Film",
    emoji: "🎞️",
    tagline: "Sepia reels and projector dust",
    colors: {
      ...COLORS,
      bgPrimary: "#141009",
      bgCard: "#1f1810",
      bgElevated: "#282016",
      border: "#3d3222",
      borderFocused: "#c9a15a",
      textPrimary: "#e8ddc4",
      textSecondary: "#9a8d70",
      textInverse: "#141009",
      accent: "#c9a15a",
      accentLight: "rgba(201, 161, 90, 0.12)",
      secondary: "#463a25",
      success: "#8a9a5b",
      successLight: "rgba(138, 154, 91, 0.12)",
      error: "#a05252",
      errorLight: "rgba(160, 82, 82, 0.12)",
      warning: "#c9a15a",
      warningLight: "rgba(201, 161, 90, 0.12)",
      yearText: "#d8b978",
      white: "#f2ead6",
    },
    effects: { ...NO_EFFECTS, flicker: true, scanlines: true, vignette: true },
    statusBar: "light",
  },
  {
    id: "trippy",
    name: "Trippy",
    emoji: "🌀",
    tagline: "Reality is a suggestion",
    colors: { ...TRIPPY_COLORS },
    effects: {
      ...NO_EFFECTS,
      glow: true,
      rainbow: true,
      swirl: true,
      floaties: ["🌀", "🍄", "👁️", "🫠"],
    },
    statusBar: "light",
  },
  {
    id: "tadi",
    name: "Tadi",
    emoji: "👽",
    tagline: "Trippy, but it compiles",
    colors: { ...TRIPPY_COLORS },
    effects: {
      ...NO_EFFECTS,
      glow: true,
      rainbow: true,
      swirl: true,
      pulse: true,
      melt: true,
      floaties: ["🌀", "🍄", "👽", "🫠", "💾"],
    },
    statusBar: "light",
    pairedFontId: "jetbrains-mono",
  },
  {
    id: "sexy",
    name: "Sexy",
    emoji: "🍷",
    tagline: "Velvet, candlelight and gold",
    colors: {
      ...COLORS,
      bgPrimary: "#170a10",
      bgCard: "#231018",
      bgElevated: "#2d1520",
      border: "#4a2233",
      borderFocused: "#d4356b",
      textPrimary: "#f4e3ea",
      textSecondary: "#a67f90",
      accent: "#d4356b",
      accentLight: "rgba(212, 53, 107, 0.13)",
      secondary: "#3d1a2a",
      success: "#7fb69a",
      successLight: "rgba(127, 182, 154, 0.12)",
      error: "#e0245e",
      errorLight: "rgba(224, 36, 94, 0.12)",
      warning: "#d4af37",
      warningLight: "rgba(212, 175, 55, 0.12)",
      yearText: "#d4af37",
    },
    effects: { ...NO_EFFECTS, glow: true, vignette: true },
    statusBar: "light",
  },
];

export function getTheme(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}
