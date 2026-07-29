import { getTheme, THEMES, type Theme, type ThemeEffects } from "./themes";
import {
  CUSTOM_THEME_ID,
  normalizeHex,
  parseFloaties,
} from "./customTheme";

/**
 * Themes are PRESETS, not fixed looks — the exact decision the game modes
 * made: every theme is a named point in one shared config space, and every
 * dial below is adjustable on top of ANY theme. Edits live per theme
 * (`looks[themeId]` in the store), so tuning Rave never touches Custom, and
 * "reset" simply deletes the override and the preset shines through again.
 */
export interface ThemeLook {
  /** Accent hex, or null = the preset's own accent */
  accent: string | null;
  /**
   * Background hex, or null = the preset's palette. Surfaces (cards, borders)
   * are derived from it, so one pick restyles the whole depth stack.
   */
  background: string | null;
  /** Text hex, or null = the preset's. Secondary text is derived. */
  textColor: string | null;
  /** Palette base — only the Custom theme renders a switch for it */
  base: "dark" | "light";
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
    /** Shader id: simple preset, trip preset, "user:<id>", or "" = none */
    shader: string;
  };
  shaderIntensity: number;
  /**
   * Tone-map guard: compresses the shader's highlights so text stays
   * readable underneath. On by default; trip mode may talk you out of it.
   */
  shaderGuard: boolean;
  meltIntensity: number;
  warpIntensity: number;
  flashlightIntensity: number;
  clickGlitchIntensity: number;
}

const DEFAULT_INTENSITIES = {
  shaderIntensity: 0.5,
  shaderGuard: true,
  meltIntensity: 0.5,
  warpIntensity: 0.5,
  flashlightIntensity: 0.5,
  clickGlitchIntensity: 0.5,
} as const;

/**
 * The factory look of one theme, derived from its ThemeEffects. Cached so the
 * same object comes back every call — these feed zustand selectors, and a
 * fresh object per call would re-render every subscriber every time.
 */
const presetCache = new Map<string, ThemeLook>();

export function presetLookFor(themeId: string): ThemeLook {
  const cached = presetCache.get(themeId);
  if (cached) return cached;

  const theme = getTheme(themeId);
  const fx: ThemeEffects | null = theme?.effects ?? null;
  const look: ThemeLook = {
    accent: null,
    background: null,
    textColor: null,
    base: "dark",
    effects: {
      glow: fx?.glow ?? false,
      blur: fx?.blur ?? false,
      pulse: fx?.pulse ?? false,
      rainbow: fx?.rainbow ?? false,
      swirl: fx?.swirl ?? false,
      melt: fx?.melt ?? false,
      glitch: fx?.glitch ?? false,
      flicker: fx?.flicker ?? false,
      scanlines: fx?.scanlines ?? false,
      vignette: fx?.vignette ?? false,
      floaties: fx?.floaties?.join("") ?? "",
      cursorWarp: fx?.cursorWarp ?? false,
      flashlight: fx?.flashlight ?? false,
      clickGlitch: fx?.clickGlitch ?? false,
      shader: fx?.shader ?? "",
    },
    ...DEFAULT_INTENSITIES,
  };
  presetCache.set(themeId, look);
  return look;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function channels(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/** Blend two hex colors; t = 1 is fully `to` */
export function mixHex(from: string, to: string, t: number): string {
  const a = channels(from);
  const b = channels(to);
  const hex = (v: number) =>
    Math.round(v).toString(16).padStart(2, "0");
  return `#${hex(a[0] + (b[0] - a[0]) * t)}${hex(a[1] + (b[1] - a[1]) * t)}${hex(a[2] + (b[2] - a[2]) * t)}`;
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Lift a surface off a background: dark bases get lighter, light bases get
 * darker. This is what turns ONE picked background into a whole depth stack
 * (card, elevated, border) that still reads as layers.
 */
export function elevate(hex: string, amount: number): string {
  return mixHex(hex, luminance(hex) < 128 ? "#ffffff" : "#000000", amount);
}

/**
 * Build the final Theme from a preset id plus an optional user look.
 * No look = the preset verbatim. This is THE resolution path — the old
 * buildCustomTheme is just the special case themeId === "custom".
 */
export function resolveTheme(
  themeId: string,
  look: ThemeLook | undefined,
): Theme {
  // Custom has no palette of its own — it borrows the most neutral built-ins
  const paletteId =
    themeId === CUSTOM_THEME_ID
      ? (look?.base ?? "dark") === "light"
        ? "minimal"
        : "classic"
      : themeId;
  const base = getTheme(paletteId) ?? THEMES[0];

  if (!look) {
    if (themeId !== CUSTOM_THEME_ID) return base;
    // Untweaked Custom: neutral base, no effects
    return {
      ...base,
      id: CUSTOM_THEME_ID,
      name: "Custom",
      emoji: "🎨",
      tagline: "Your colors, your rules",
    };
  }

  const accent = look.accent ? (normalizeHex(look.accent) ?? base.colors.accent) : base.colors.accent;

  const effects: ThemeEffects = {
    glow: look.effects.glow,
    blur: look.effects.blur,
    pulse: look.effects.pulse,
    rainbow: look.effects.rainbow,
    swirl: look.effects.swirl,
    melt: look.effects.melt,
    glitch: look.effects.glitch,
    flicker: look.effects.flicker,
    scanlines: look.effects.scanlines,
    vignette: look.effects.vignette,
    floaties: parseFloaties(look.effects.floaties),
    cursorWarp: look.effects.cursorWarp,
    flashlight: look.effects.flashlight,
    clickGlitch: look.effects.clickGlitch,
    // The layer resolves (and gates) the id — unknown ids simply render nothing
    shader: look.effects.shader || null,
  };

  // One picked background restyles the whole depth stack; one picked text
  // color keeps its secondary shade readable against exactly that background.
  // Both exist because a loud effect layer can eat the preset's contrast.
  const background = look.background ? normalizeHex(look.background) : null;
  const textColor = look.textColor ? normalizeHex(look.textColor) : null;

  const custom = themeId === CUSTOM_THEME_ID;
  return {
    ...base,
    id: themeId,
    name: custom ? "Custom" : base.name,
    emoji: custom ? "🎨" : base.emoji,
    tagline: custom ? "Your colors, your rules" : base.tagline,
    colors: {
      ...base.colors,
      accent,
      accentLight: hexToRgba(accent, 0.13),
      borderFocused: accent,
      ...(background
        ? {
            bgPrimary: background,
            bgCard: elevate(background, 0.06),
            bgElevated: elevate(background, 0.11),
            border: elevate(background, 0.22),
            secondary: elevate(background, 0.16),
          }
        : {}),
      ...(textColor
        ? {
            textPrimary: textColor,
            textSecondary: mixHex(
              textColor,
              background ?? base.colors.bgPrimary,
              0.42,
            ),
          }
        : {}),
    },
    // The status bar follows the actual background, not the preset's
    statusBar: background
      ? luminance(background) < 128
        ? "light"
        : "dark"
      : base.statusBar,
    effects,
  };
}

/** Clamp helper shared by the store's intensity setters */
export function clamp01(value: unknown, fallback = 0.5): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

/**
 * Parse one stored look back into shape. Anything unreadable falls back to
 * the preset — a corrupt setting must never break the app's look entirely.
 */
export function parseLook(raw: unknown, themeId: string): ThemeLook | null {
  if (typeof raw !== "object" || raw === null) return null;
  const preset = presetLookFor(themeId);
  const v = raw as Partial<ThemeLook> & { effects?: Partial<ThemeLook["effects"]> };
  const bool = (x: unknown, fb: boolean): boolean =>
    typeof x === "boolean" ? x : fb;
  return {
    accent:
      typeof v.accent === "string" ? (normalizeHex(v.accent) ?? null) : null,
    background:
      typeof v.background === "string"
        ? (normalizeHex(v.background) ?? null)
        : null,
    textColor:
      typeof v.textColor === "string"
        ? (normalizeHex(v.textColor) ?? null)
        : null,
    base: v.base === "light" ? "light" : "dark",
    effects: {
      glow: bool(v.effects?.glow, preset.effects.glow),
      blur: bool(v.effects?.blur, preset.effects.blur),
      pulse: bool(v.effects?.pulse, preset.effects.pulse),
      rainbow: bool(v.effects?.rainbow, preset.effects.rainbow),
      swirl: bool(v.effects?.swirl, preset.effects.swirl),
      melt: bool(v.effects?.melt, preset.effects.melt),
      glitch: bool(v.effects?.glitch, preset.effects.glitch),
      flicker: bool(v.effects?.flicker, preset.effects.flicker),
      scanlines: bool(v.effects?.scanlines, preset.effects.scanlines),
      vignette: bool(v.effects?.vignette, preset.effects.vignette),
      floaties:
        typeof v.effects?.floaties === "string"
          ? v.effects.floaties.slice(0, 16)
          : preset.effects.floaties,
      cursorWarp: bool(v.effects?.cursorWarp, preset.effects.cursorWarp),
      flashlight: bool(v.effects?.flashlight, preset.effects.flashlight),
      clickGlitch: bool(v.effects?.clickGlitch, preset.effects.clickGlitch),
      shader:
        typeof v.effects?.shader === "string"
          ? v.effects.shader.slice(0, 64)
          : preset.effects.shader,
    },
    shaderIntensity: clamp01(v.shaderIntensity),
    shaderGuard: bool(v.shaderGuard, true),
    meltIntensity: clamp01(v.meltIntensity),
    warpIntensity: clamp01(v.warpIntensity),
    flashlightIntensity: clamp01(v.flashlightIntensity),
    clickGlitchIntensity: clamp01(v.clickGlitchIntensity),
  };
}
