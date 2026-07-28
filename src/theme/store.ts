import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_THEME_ID, getTheme } from "./themes";
import { CUSTOM_THEME_ID } from "./customTheme";
import {
  clamp01,
  parseLook,
  presetLookFor,
  type ThemeLook,
} from "./look";
import { isShaderPresetId } from "./shader/presets";
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

/** Numeric look dials the sliders drive */
export type LookIntensityKey =
  | "shaderIntensity"
  | "meltIntensity"
  | "warpIntensity"
  | "flashlightIntensity"
  | "clickGlitchIntensity";

interface ThemeStore {
  themeId: string;
  /**
   * Per-theme overrides. Only themes the user touched have an entry — the
   * split is what makes "reset" trivial (delete the entry) and keeps a tweak
   * on Rave from ever leaking into Custom.
   */
  looks: Record<string, ThemeLook>;
  /** The advanced-effects gate ("Kommste mit aufn Trip?") */
  tripMode: boolean;
  // Device/accessibility settings — deliberately GLOBAL, not per look:
  // tempo belongs to the song, quality to the GPU, text to the reader.
  fontScaleId: string;
  fontId: string;
  effectSpeedId: string;
  effectBpm: number;
  /** Slider position for the "custom" effect-speed mode */
  effectFactor: number;
  /** Shader resolution: the single biggest performance lever */
  shaderQualityId: string;
  setTheme: (id: string) => void;
  updateLook: (patch: Partial<Omit<ThemeLook, "effects">>) => void;
  updateLookEffects: (patch: Partial<ThemeLook["effects"]>) => void;
  setLookIntensity: (key: LookIntensityKey, intensity: number) => void;
  /** Back to the preset: forgets every tweak on the CURRENT theme */
  resetLook: () => void;
  setTripMode: (on: boolean) => void;
  setFontScale: (id: string) => void;
  setFont: (id: string) => void;
  setEffectSpeed: (id: string) => void;
  setEffectBpm: (bpm: number) => void;
  setEffectFactor: (factor: number) => void;
  setShaderQuality: (id: string) => void;
}

function persist(): void {
  const {
    themeId,
    looks,
    tripMode,
    fontScaleId,
    fontId,
    effectSpeedId,
    effectBpm,
    effectFactor,
    shaderQualityId,
  } = useThemeStore.getState();
  AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      v: 2,
      themeId,
      looks,
      tripMode,
      fontScaleId,
      fontId,
      effectSpeedId,
      effectBpm,
      effectFactor,
      shaderQualityId,
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

/** The current theme's look — the stored tweak, or the pristine preset */
function lookOf(state: { themeId: string; looks: Record<string, ThemeLook> }): ThemeLook {
  return state.looks[state.themeId] ?? presetLookFor(state.themeId);
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  themeId: DEFAULT_THEME_ID,
  looks: {},
  tripMode: false,
  fontScaleId: DEFAULT_FONT_SCALE_ID,
  fontId: DEFAULT_FONT_ID,
  effectSpeedId: DEFAULT_EFFECT_SPEED_ID,
  effectBpm: DEFAULT_EFFECT_BPM,
  effectFactor: 1,
  shaderQualityId: DEFAULT_SHADER_QUALITY_ID,

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
  updateLook: (patch) => {
    const state = get();
    set({
      looks: {
        ...state.looks,
        [state.themeId]: { ...lookOf(state), ...patch },
      },
    });
    persist();
  },
  updateLookEffects: (patch) => {
    const state = get();
    const look = lookOf(state);
    set({
      looks: {
        ...state.looks,
        [state.themeId]: {
          ...look,
          effects: { ...look.effects, ...patch },
        },
      },
    });
    persist();
  },
  setLookIntensity: (key, intensity) => {
    const state = get();
    const look = lookOf(state);
    const clamped = clamp01(intensity);
    if (look[key] === clamped) return;
    set({
      looks: {
        ...state.looks,
        [state.themeId]: { ...look, [key]: clamped },
      },
    });
    // Trailing debounce: one storage write per drag, not one per step
    // (AsyncStorage is synchronous localStorage on web)
    persistDebounced();
  },
  resetLook: () => {
    const state = get();
    if (!(state.themeId in state.looks)) return;
    const looks = { ...state.looks };
    delete looks[state.themeId];
    set({ looks });
    persist();
  },
  setTripMode: (on) => {
    if (on) {
      set({ tripMode: true });
      persist();
      return;
    }
    // Leaving the trip sobers up every look: advanced and user shaders go,
    // simple presets stay. Otherwise a hidden look keeps tripping forever.
    const looks = { ...get().looks };
    for (const [id, look] of Object.entries(looks)) {
      const shader = look.effects.shader;
      if (shader && !isShaderPresetId(shader)) {
        looks[id] = { ...look, effects: { ...look.effects, shader: "" } };
      }
    }
    set({ tripMode: false, looks });
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
    persistDebounced();
  },
  setShaderQuality: (id) => {
    if (!SHADER_QUALITIES.some((q) => q.id === id)) return;
    set({ shaderQualityId: id });
    persist();
  },
}));

/**
 * The active theme's look, reactive. Components read their dials from here —
 * nobody but the store knows whether that's a tweak or the pristine preset.
 */
export function useCurrentLook(): ThemeLook {
  return useThemeStore((s) => s.looks[s.themeId] ?? presetLookFor(s.themeId));
}

/** True when the current theme differs from its preset (shows the reset) */
export function useLookTweaked(): boolean {
  return useThemeStore((s) => s.themeId in s.looks);
}

/** Restore saved UI settings on app start (called from the root layout) */
export async function hydrateTheme(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (parsed && typeof parsed === "object") {
        const s = parsed as Record<string, unknown>;
        const looks: Record<string, ThemeLook> = {};

        if (s.looks && typeof s.looks === "object") {
          // v2 shape: per-theme looks
          for (const [id, raw] of Object.entries(
            s.looks as Record<string, unknown>,
          )) {
            if (!isValidThemeId(id)) continue;
            const look = parseLook(raw, id);
            if (look) looks[id] = look;
          }
        } else if (s.custom && typeof s.custom === "object") {
          // v1 shape: one custom config + global intensities → they become
          // the custom theme's look, since that's where they were visible
          const old = s.custom as {
            base?: unknown;
            accent?: unknown;
            effects?: unknown;
          };
          const migrated = parseLook(
            {
              accent: old.accent,
              base: old.base,
              effects: old.effects,
              shaderIntensity: s.shaderIntensity,
              meltIntensity: s.meltIntensity,
              warpIntensity: s.warpIntensity,
              flashlightIntensity: s.flashlightIntensity,
              clickGlitchIntensity: s.clickGlitchIntensity,
            },
            CUSTOM_THEME_ID,
          );
          if (migrated) looks[CUSTOM_THEME_ID] = migrated;
        }

        useThemeStore.setState({
          themeId:
            typeof s.themeId === "string" && isValidThemeId(s.themeId)
              ? s.themeId
              : DEFAULT_THEME_ID,
          looks,
          tripMode: s.tripMode === true,
          fontScaleId: FONT_SCALES.some((f) => f.id === s.fontScaleId)
            ? (s.fontScaleId as string)
            : DEFAULT_FONT_SCALE_ID,
          fontId:
            typeof s.fontId === "string" && getFontOption(s.fontId)
              ? s.fontId
              : DEFAULT_FONT_ID,
          effectSpeedId:
            typeof s.effectSpeedId === "string" && isValidSpeedId(s.effectSpeedId)
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
          shaderQualityId: SHADER_QUALITIES.some(
            (q) => q.id === s.shaderQualityId,
          )
            ? (s.shaderQualityId as string)
            : DEFAULT_SHADER_QUALITY_ID,
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
