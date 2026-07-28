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
  clampFactor,
  CUSTOM_SPEED_ID,
  DEFAULT_EFFECT_BPM,
  DEFAULT_EFFECT_SPEED_ID,
  getEffectSpeed,
} from "./effectTempo";
import {
  DEFAULT_SHADER_QUALITY_ID,
  SHADER_QUALITIES,
} from "./shader/quality";

function isValidSpeedId(id: string): boolean {
  return id === CUSTOM_SPEED_ID || getEffectSpeed(id) !== undefined;
}

const STORAGE_KEY = "uiSettings";
/** Pre-customization storage key — migrated on first load */
const LEGACY_THEME_KEY = "themeId";

interface ThemeStore {
  themeId: string;
  fontScaleId: string;
  fontId: string;
  effectSpeedId: string;
  effectBpm: number;
  /** Slider position for the "custom" effect-speed mode */
  effectFactor: number;
  /** How hard the melt effect distorts the UI (0 = off … 1 = full goo) */
  meltIntensity: number;
  /** Size and bend of the cursor lens (0 = small and subtle … 1 = huge) */
  warpIntensity: number;
  /** How wide the flashlight circle opens */
  flashlightIntensity: number;
  /** How violent a click burst is */
  clickGlitchIntensity: number;
  /** Shader resolution: the single biggest performance lever */
  shaderQualityId: string;
  /** How loud the shader layer is mixed over the UI */
  shaderIntensity: number;
  custom: CustomThemeConfig;
  setTheme: (id: string) => void;
  setFontScale: (id: string) => void;
  setFont: (id: string) => void;
  setEffectSpeed: (id: string) => void;
  setEffectBpm: (bpm: number) => void;
  setEffectFactor: (factor: number) => void;
  setMeltIntensity: (intensity: number) => void;
  setShaderQuality: (id: string) => void;
  setShaderIntensity: (intensity: number) => void;
  setPointerIntensity: (
    key: "warpIntensity" | "flashlightIntensity" | "clickGlitchIntensity",
    intensity: number,
  ) => void;
  updateCustom: (patch: Partial<CustomThemeConfig>) => void;
  updateCustomEffects: (
    patch: Partial<CustomThemeConfig["effects"]>,
  ) => void;
}

function persist(): void {
  const {
    themeId,
    fontScaleId,
    fontId,
    effectSpeedId,
    effectBpm,
    effectFactor,
    meltIntensity,
    warpIntensity,
    flashlightIntensity,
    clickGlitchIntensity,
    custom,
  } = useThemeStore.getState();
  AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      themeId,
      fontScaleId,
      fontId,
      effectSpeedId,
      effectBpm,
      effectFactor,
      meltIntensity,
      warpIntensity,
      flashlightIntensity,
      clickGlitchIntensity,
      custom,
    }),
  ).catch(() => {
    /* persistence is best-effort */
  });
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** Trailing-debounced persist for high-frequency setters (slider drags) */
function persistDebounced(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persist();
  }, 400);
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
  effectFactor: 1,
  meltIntensity: 0.5,
  warpIntensity: 0.5,
  flashlightIntensity: 0.5,
  clickGlitchIntensity: 0.5,
  shaderQualityId: DEFAULT_SHADER_QUALITY_ID,
  shaderIntensity: 0.5,
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
    if (!isValidSpeedId(id)) return;
    set({ effectSpeedId: id });
    persist();
  },
  setEffectBpm: (bpm) => {
    set({ effectBpm: clampBpm(bpm) });
    persist();
  },
  setEffectFactor: (factor) => {
    const clamped = clampFactor(factor);
    const state = get();
    // Slider drags fire often — skip no-op updates entirely
    if (
      state.effectFactor === clamped &&
      state.effectSpeedId === CUSTOM_SPEED_ID
    ) {
      return;
    }
    // Dragging the slider always means "use MY speed" — switch mode along
    set({ effectFactor: clamped, effectSpeedId: CUSTOM_SPEED_ID });
    // Trailing debounce: one storage write per drag, not one per step
    // (AsyncStorage is synchronous localStorage on web)
    persistDebounced();
  },
  setMeltIntensity: (intensity) => {
    const clamped = Math.min(1, Math.max(0, intensity));
    if (get().meltIntensity === clamped) return;
    set({ meltIntensity: clamped });
    persistDebounced();
  },
  setShaderQuality: (id) => {
    if (!SHADER_QUALITIES.some((q) => q.id === id)) return;
    set({ shaderQualityId: id });
    persist();
  },
  setShaderIntensity: (intensity) => {
    const clamped = Math.min(1, Math.max(0, intensity));
    if (get().shaderIntensity === clamped) return;
    set({ shaderIntensity: clamped });
    persistDebounced();
  },
  setPointerIntensity: (key, intensity) => {
    const clamped = Math.min(1, Math.max(0, intensity));
    if (get()[key] === clamped) return;
    set({ [key]: clamped } as Pick<ThemeStore, typeof key>);
    persistDebounced();
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

/** Stored intensities are 0..1; anything else falls back to the middle */
function clamp01(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0.5;
}

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
          effectFactor: number;
          meltIntensity: number;
          warpIntensity: number;
          flashlightIntensity: number;
          clickGlitchIntensity: number;
          shaderQualityId: string;
          shaderIntensity: number;
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
            s.effectSpeedId && isValidSpeedId(s.effectSpeedId)
              ? s.effectSpeedId
              : DEFAULT_EFFECT_SPEED_ID,
          effectBpm:
            typeof s.effectBpm === "number"
              ? clampBpm(s.effectBpm)
              : DEFAULT_EFFECT_BPM,
          effectFactor:
            typeof s.effectFactor === "number"
              ? clampFactor(s.effectFactor)
              : 1,
          meltIntensity:
            typeof s.meltIntensity === "number"
              ? Math.min(1, Math.max(0, s.meltIntensity))
              : 0.5,
          warpIntensity: clamp01(s.warpIntensity),
          flashlightIntensity: clamp01(s.flashlightIntensity),
          clickGlitchIntensity: clamp01(s.clickGlitchIntensity),
          shaderQualityId: SHADER_QUALITIES.some(
            (q) => q.id === s.shaderQualityId,
          )
            ? (s.shaderQualityId as string)
            : DEFAULT_SHADER_QUALITY_ID,
          shaderIntensity: clamp01(s.shaderIntensity),
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
