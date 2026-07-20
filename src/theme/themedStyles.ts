import { useThemeStore } from "./store";
import { getTheme, THEMES, type Theme, type ThemeColors } from "./themes";

/** The currently selected theme (reactive) */
export function useTheme(): Theme {
  const themeId = useThemeStore((s) => s.themeId);
  return getTheme(themeId) ?? THEMES[0];
}

/** Just the palette — for inline color props outside of StyleSheets */
export function useThemeColors(): ThemeColors {
  return useTheme().colors;
}

/**
 * Theme-aware replacement for a module-level `StyleSheet.create`.
 *
 *   const useStyles = createThemedStyles((COLORS) => StyleSheet.create({...}));
 *   // in the component:
 *   const styles = useStyles();
 *
 * Naming the factory parameter `COLORS` keeps existing style bodies unchanged.
 * Sheets are built once per theme and cached.
 */
export function createThemedStyles<T>(
  factory: (colors: ThemeColors, theme: Theme) => T,
): () => T {
  const cache = new Map<string, T>();
  return function useStyles(): T {
    const theme = useTheme();
    const cached = cache.get(theme.id);
    if (cached !== undefined) return cached;
    const sheet = factory(theme.colors, theme);
    cache.set(theme.id, sheet);
    return sheet;
  };
}
