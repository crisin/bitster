import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_THEME_ID, getTheme } from "./themes";
import {
  CUSTOM_THEME_ID,
  DEFAULT_CUSTOM_CONFIG,
  type CustomThemeConfig,
} from "./customTheme";
import {
  DEFAULT_FONT_ID,
  DEFAULT_FONT_SCALE_ID,
  FONT_SCALES,
  getFontOption,
} from "./typography";
import {
  clampBpm,
  DEFAULT_EFFECT_BPM,
  DEFAULT_EFFECT_SPEED_ID,
  getEffectSpeed,
} from "./effectTempo";

const STORAGE_KEY = "uiSettings";
/** Pre-customization storage key — migrated on first load */
const LEGACY_THEME_KEY = "themeId";

interface ThemeStore {
  themeId: string;
  fontScaleId: string;
  fontId: string;
  effectSpeedId: string;
  effectBpm: number;
  custom: CustomThemeConfig;
  setTheme: (id: string) => void;
  setFontScale: (id: string) => void;
  setFont: (id: string) => void;
  setEffectSpeed: (id: string) => void;
  setEffectBpm: (bpm: number) => void;
  updateCustom: (patch: Partial<CustomThemeConfig>) => void;
  updateCustomEffects: (
    patch: Partial<CustomThemeConfig["effects"]>,
  ) => void;
}

function persist(): void {
  const { themeId, fontScaleId, fontId, effectSpeedId, effectBpm, custom } =
    useThemeStore.getState();
  AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      themeId,
      fontScaleId,
      fontId,
      effectSpeedId,
      effectBpm,
      custom,
    }),
  ).catch(() => {
    /* persistence is best-effort */
  });
}

function isValidThemeId(id: string): boolean {
  return id === CUSTOM_THEME_ID || getTheme(id) !== undefined;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  themeId: DEFAULT_THEME_ID,
  fontScaleId: DEFAULT_FONT_SCALE_ID,
  fontId: DEFAULT_FONT_ID,
  effectSpeedId: DEFAULT_EFFECT_SPEED_ID,
  effectBpm: DEFAULT_EFFECT_BPM,
  custom: DEFAULT_CUSTOM_CONFIG,

  setTheme: (id) => {
    if (!isValidThemeId(id)) return;
    // A theme can bring its own font (e.g. Tadi → JetBrains Mono). The user
    // can still switch fonts afterwards — this is a one-time convenience.
    const paired = getTheme(id)?.pairedFontId;
    if (paired && getFontOption(paired)) {
      set({ themeId: id, fontId: paired });
    } else {
      set({ themeId: id });
    }
    persist();
  },
  setFontScale: (id) => {
    if (!FONT_SCALES.some((s) => s.id === id)) return;
    set({ fontScaleId: id });
    persist();
  },
  setFont: (id) => {
    if (!getFontOption(id)) return;
    set({ fontId: id });
    persist();
  },
  setEffectSpeed: (id) => {
    if (!getEffectSpeed(id)) return;
    set({ effectSpeedId: id });
    persist();
  },
  setEffectBpm: (bpm) => {
    set({ effectBpm: clampBpm(bpm) });
    persist();
  },
  updateCustom: (patch) => {
    set({ custom: { ...get().custom, ...patch } });
    persist();
  },
  updateCustomEffects: (patch) => {
    const custom = get().custom;
    set({ custom: { ...custom, effects: { ...custom.effects, ...patch } } });
    persist();
  },
}));

/** Restore saved UI settings on app start (called from the root layout) */
export async function hydrateTheme(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (parsed && typeof parsed === "object") {
        const s = parsed as Partial<{
          themeId: string;
          fontScaleId: string;
          fontId: string;
          effectSpeedId: string;
          effectBpm: number;
          custom: Partial<CustomThemeConfig>;
        }>;
        useThemeStore.setState({
          themeId:
            s.themeId && isValidThemeId(s.themeId)
              ? s.themeId
              : DEFAULT_THEME_ID,
          fontScaleId: FONT_SCALES.some((f) => f.id === s.fontScaleId)
            ? (s.fontScaleId as string)
            : DEFAULT_FONT_SCALE_ID,
          fontId:
            s.fontId && getFontOption(s.fontId)
              ? s.fontId
              : DEFAULT_FONT_ID,
          effectSpeedId:
            s.effectSpeedId && getEffectSpeed(s.effectSpeedId)
              ? s.effectSpeedId
              : DEFAULT_EFFECT_SPEED_ID,
          effectBpm:
            typeof s.effectBpm === "number"
              ? clampBpm(s.effectBpm)
              : DEFAULT_EFFECT_BPM,
          custom: {
            ...DEFAULT_CUSTOM_CONFIG,
            ...s.custom,
            effects: {
              ...DEFAULT_CUSTOM_CONFIG.effects,
              ...s.custom?.effects,
            },
          },
        });
        return;
      }
    }
    // Migrate the old plain themeId key if present
    const legacy = await AsyncStorage.getItem(LEGACY_THEME_KEY);
    if (legacy && getTheme(legacy)) {
      useThemeStore.setState({ themeId: legacy });
    }
  } catch {
    // stay on the defaults
  }
}
