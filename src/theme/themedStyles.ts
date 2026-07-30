import { useThemeStore } from "./store";
import { resolveThemeCached } from "./look";
import type { Theme, ThemeColors } from "./themes";
import {
  getBrowserFontScale,
  getFontOption,
  getFontScale,
  type FontOption,
} from "./typography";

/**
 * The currently selected theme (reactive). Every theme resolves through the
 * same path — preset plus the user's per-theme look, if any.
 *
 * Uses the identity-stable cache: a look change that doesn't touch the
 * palette (all five intensity dials, the guard) yields the SAME Theme object,
 * so none of the ~46 style hooks re-render during a slider drag.
 */
export function useTheme(): Theme {
  return useThemeStore((s) => resolveThemeCached(s.themeId, s.looks[s.themeId]));
}

/** Just the palette — for inline color props outside of StyleSheets */
export function useThemeColors(): ThemeColors {
  return useTheme().colors;
}

type AnyStyle = Record<string, unknown>;

/**
 * Applies the user's text settings to a finished style sheet: multiplies
 * fontSize/lineHeight by the effective scale and swaps in the chosen font
 * family. On native, RN's allowFontScaling already factors in the OS text
 * size; on web the browser's default-font-size setting is multiplied in.
 *
 * Styles that set their own fontFamily (e.g. the Bebas display font) keep it.
 * Custom fonts are loaded one file per weight, so fontWeight is replaced by
 * the matching family instead (>= 600 → bold cut).
 */
function applyTypography<T>(sheet: T, scale: number, font: FontOption): T {
  if (scale === 1 && font.regular === null) return sheet;

  const out: Record<string, unknown> = {};
  for (const [name, style] of Object.entries(sheet as Record<string, AnyStyle>)) {
    if (
      style === null ||
      typeof style !== "object" ||
      typeof style.fontSize !== "number"
    ) {
      out[name] = style;
      continue;
    }
    const next: AnyStyle = { ...style, fontSize: style.fontSize * scale };
    if (typeof style.lineHeight === "number") {
      next.lineHeight = style.lineHeight * scale;
    }
    if (font.regular !== null && style.fontFamily == null) {
      const weight = style.fontWeight;
      const numeric =
        typeof weight === "string"
          ? weight === "bold"
            ? 700
            : Number.parseInt(weight, 10) || 400
          : typeof weight === "number"
            ? weight
            : 400;
      next.fontFamily = numeric >= 600 ? font.bold : font.regular;
      delete next.fontWeight;
    }
    out[name] = next;
  }
  return out as T;
}

/**
 * Theme-aware replacement for a module-level `StyleSheet.create`.
 *
 *   const useStyles = createThemedStyles((COLORS) => StyleSheet.create({...}));
 *   // in the component:
 *   const styles = useStyles();
 *
 * Naming the factory parameter `COLORS` keeps existing style bodies unchanged.
 * Sheets are built once per (theme, text settings) combination and cached.
 */
export function createThemedStyles<T>(
  factory: (colors: ThemeColors, theme: Theme) => T,
): () => T {
  const cache = new Map<string, T>();
  return function useStyles(): T {
    const theme = useTheme();
    const fontScaleId = useThemeStore((s) => s.fontScaleId);
    const fontId = useThemeStore((s) => s.fontId);

    // Any theme can carry a look now, so any theme can change its palette.
    // Key on exactly the fields that move colors — keeps the cache small.
    const look = useThemeStore.getState().looks[theme.id];
    const themeKey = look
      ? `${theme.id}:${look.accent ?? ""}:${look.background ?? ""}:${look.textColor ?? ""}:${look.base}:${look.effects.glow ? 1 : 0}${look.effects.blur ? 1 : 0}`
      : theme.id;
    const key = `${themeKey}|${fontScaleId}|${fontId}`;

    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const scale = getFontScale(fontScaleId) * getBrowserFontScale();
    const font = getFontOption(fontId) ?? { regular: null, bold: null, id: "system", name: "", tagline: "" };
    const sheet = applyTypography(factory(theme.colors, theme), scale, font);
    cache.set(key, sheet);
    return sheet;
  };
}
