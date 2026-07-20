import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_THEME_ID, getTheme } from "./themes";

const STORAGE_KEY = "themeId";

interface ThemeStore {
  themeId: string;
  setTheme: (id: string) => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  themeId: DEFAULT_THEME_ID,
  setTheme: (id) => {
    if (!getTheme(id)) return;
    set({ themeId: id });
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {
      /* persistence is best-effort */
    });
  },
}));

/** Restore the saved theme on app start (called from the root layout) */
export async function hydrateTheme(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && getTheme(stored)) {
      useThemeStore.setState({ themeId: stored });
    }
  } catch {
    // stay on the default theme
  }
}
