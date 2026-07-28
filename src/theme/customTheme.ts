import { getTheme, type Theme, type ThemeEffects } from "./themes";
import { isShaderPresetId } from "./shader/presets";

/**
 * User-defined theme: a dark or light base palette, a free accent color and
 * hand-picked effects. Persisted in the theme store, rendered through the
 * exact same Theme shape as the built-in looks.
 */
export interface CustomThemeConfig {
  base: "dark" | "light";
  /** Hex accent color (#rgb or #rrggbb) */
  accent: string;
  effects: {
    glow: boolean;
    blur: boolean;
    pulse: boolean;
    rainbow: boolean;
    swirl: boolean;
    melt: boolean;
    glitch: boolean;
    flicker: boolean;
    scanlines: boolean;
    vignette: boolean;
    /** Raw emoji string, split into individual floaties ("" = none) */
    floaties: string;
    cursorWarp: boolean;
    flashlight: boolean;
    clickGlitch: boolean;
    /** Shader preset id, "" = none */
    shader: string;
  };
}

export const CUSTOM_THEME_ID = "custom";

export const DEFAULT_CUSTOM_CONFIG: CustomThemeConfig = {
  base: "dark",
  accent: "#c9485b",
  effects: {
    glow: false,
    blur: false,
    pulse: false,
    rainbow: false,
    swirl: false,
    melt: false,
    glitch: false,
    flicker: false,
    scanlines: false,
    vignette: false,
    floaties: "",
    cursorWarp: false,
    flashlight: false,
    clickGlitch: false,
    shader: "",
  },
};

/** Accent swatches offered in the editor (free hex input works too) */
export const ACCENT_PRESETS = [
  "#c9485b", // bitster red
  "#e0245e", // hot pink
  "#ff6fae", // bubblegum
  "#c026ff", // purple
  "#7c5cff", // violet
  "#3b82f6", // blue
  "#00b8d9", // cyan
  "#1db954", // green
  "#3faa9e", // teal
  "#f5a623", // orange
  "#d4af37", // gold
  "#e8e6e3", // silver
];

/** "#rgb" or "#rrggbb" (case-insensitive) → normalized "#rrggbb", else null */
export function normalizeHex(input: string): string | null {
  const value = input.trim().replace(/^#?/, "#");
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const [, r, g, b] = value;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Pool for the "surprise me" dice. Deliberately all astral-plane emoji with no
 * zero-width joiners or variation selectors — those count several UTF-16 units
 * each and would blow past the input's maxLength after two or three picks.
 */
const FLOATIE_POOL = [
  "🎵", "🎸", "🎺", "🥁", "🪩", "💿", "📼", "🎤",
  "🍄", "👽", "👾", "🛸", "🪐", "🚀", "🌈", "🔥",
  "💀", "🎃", "🦖", "🐙", "🦄", "🐸", "🧃", "🍕",
  "🍒", "🌵", "🧿", "🪿", "🫠", "🧊", "🌊", "🍭",
  "🎲", "🕹", "💣", "🧲", "🪄", "🦩", "🐌", "🌻",
];

/** How many the dice picks — expandFloaties doubles sets of five for density */
const RANDOM_FLOATIE_COUNT = 5;

/**
 * A fresh handful of emoji for the floaties field. Returns the raw string the
 * editor stores, so the result stays visible and editable rather than being a
 * hidden "random" mode nobody can pin down.
 */
export function randomFloaties(): string {
  const pool = [...FLOATIE_POOL];
  const picked: string[] = [];
  for (let i = 0; i < RANDOM_FLOATIE_COUNT && pool.length > 0; i++) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool[index]);
    pool.splice(index, 1);
  }
  return picked.join("");
}

/** Split an emoji string into individual floaties (max 6) */
function parseFloaties(raw: string): string[] | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let parts: string[];
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    parts = [...new Intl.Segmenter().segment(trimmed)].map(
      (s) => s.segment,
    );
  } else {
    parts = Array.from(trimmed);
  }
  const emojis = parts.filter((p) => p.trim().length > 0).slice(0, 6);
  return emojis.length > 0 ? emojis : null;
}

export function buildCustomTheme(config: CustomThemeConfig): Theme {
  // Reuse the two most neutral built-ins as base palettes
  const base = getTheme(config.base === "light" ? "minimal" : "classic")!;
  const accent = normalizeHex(config.accent) ?? base.colors.accent;

  const effects: ThemeEffects = {
    glow: config.effects.glow,
    blur: config.effects.blur,
    pulse: config.effects.pulse,
    rainbow: config.effects.rainbow,
    swirl: config.effects.swirl,
    melt: config.effects.melt,
    glitch: config.effects.glitch,
    flicker: config.effects.flicker,
    scanlines: config.effects.scanlines,
    vignette: config.effects.vignette,
    floaties: parseFloaties(config.effects.floaties),
    cursorWarp: config.effects.cursorWarp,
    flashlight: config.effects.flashlight,
    clickGlitch: config.effects.clickGlitch,
    shader: isShaderPresetId(config.effects.shader)
      ? config.effects.shader
      : null,
  };

  return {
    id: CUSTOM_THEME_ID,
    name: "Custom",
    emoji: "🎨",
    tagline: "Your colors, your rules",
    colors: {
      ...base.colors,
      accent,
      accentLight: hexToRgba(accent, 0.13),
      borderFocused: accent,
    },
    effects,
    statusBar: base.statusBar,
  };
}
