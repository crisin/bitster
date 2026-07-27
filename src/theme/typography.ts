import { Platform } from "react-native";

/**
 * App font choices. All bundled fonts are free/open source (SIL OFL 1.1),
 * shipped as local assets — nothing is fetched from Google Fonts or any CDN.
 * See assets/fonts/LICENSES.md.
 */
export interface FontOption {
  id: string;
  name: string;
  tagline: string;
  /** Registered family names (expo-font); null = platform default font */
  regular: string | null;
  bold: string | null;
}

export const DEFAULT_FONT_ID = "system";

export const FONT_OPTIONS: FontOption[] = [
  {
    id: "system",
    name: "System",
    tagline: "Whatever your device speaks",
    regular: null,
    bold: null,
  },
  {
    id: "fira-sans",
    name: "Fira Sans",
    tagline: "Friendly and clear, by Mozilla",
    regular: "FiraSans-Regular",
    bold: "FiraSans-Bold",
  },
  {
    id: "space-grotesk",
    name: "Space Grotesk",
    tagline: "Retro-future party flyer vibes",
    regular: "SpaceGrotesk-Regular",
    bold: "SpaceGrotesk-Bold",
  },
  {
    id: "atkinson",
    name: "Atkinson Hyperlegible",
    tagline: "Maximum readability, by the Braille Institute",
    regular: "AtkinsonHyperlegible-Regular",
    bold: "AtkinsonHyperlegible-Bold",
  },
  {
    id: "jetbrains-mono",
    name: "JetBrains Mono",
    tagline: "For players who dream in terminals",
    regular: "JetBrainsMono-Regular",
    bold: "JetBrainsMono-Bold",
  },
];

export function getFontOption(id: string): FontOption | undefined {
  return FONT_OPTIONS.find((f) => f.id === id);
}

/** Asset map for expo-font's useFonts (loaded once in the root layout) */
export const FONT_ASSETS = {
  "FiraSans-Regular": require("../../assets/fonts/FiraSans-Regular.ttf"),
  "FiraSans-Bold": require("../../assets/fonts/FiraSans-Bold.ttf"),
  "SpaceGrotesk-Regular": require("../../assets/fonts/SpaceGrotesk-Regular.ttf"),
  "SpaceGrotesk-Bold": require("../../assets/fonts/SpaceGrotesk-Bold.ttf"),
  "AtkinsonHyperlegible-Regular": require("../../assets/fonts/AtkinsonHyperlegible-Regular.ttf"),
  "AtkinsonHyperlegible-Bold": require("../../assets/fonts/AtkinsonHyperlegible-Bold.ttf"),
  "JetBrainsMono-Regular": require("../../assets/fonts/JetBrainsMono-Regular.ttf"),
  "JetBrainsMono-Bold": require("../../assets/fonts/JetBrainsMono-Bold.ttf"),
} as const;

// ─── Text size ──────────────────────────────────────────────────

export interface FontScaleOption {
  id: string;
  name: string;
  scale: number;
}

export const DEFAULT_FONT_SCALE_ID = "m";

export const FONT_SCALES: FontScaleOption[] = [
  { id: "s", name: "Small", scale: 0.85 },
  { id: "m", name: "Default", scale: 1 },
  { id: "l", name: "Large", scale: 1.15 },
  { id: "xl", name: "Huge", scale: 1.3 },
];

export function getFontScale(id: string): number {
  return FONT_SCALES.find((s) => s.id === id)?.scale ?? 1;
}

/**
 * Browser default-font-size factor (16px = 1). Web only — on native, RN's
 * allowFontScaling already multiplies the OS text-size setting in, and our
 * user scale stacks on top of that.
 */
let browserFontScale: number | null = null;

export function getBrowserFontScale(): number {
  if (Platform.OS !== "web" || typeof document === "undefined") return 1;
  if (browserFontScale === null) {
    const base = Number.parseFloat(
      getComputedStyle(document.documentElement).fontSize,
    );
    browserFontScale =
      Number.isFinite(base) && base > 0 ? base / 16 : 1;
  }
  return browserFontScale;
}
