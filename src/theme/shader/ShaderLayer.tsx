import type { ShaderPresetId } from "./presets";

export interface ShaderLayerProps {
  preset: ShaderPresetId;
  accent: string;
  intensity: number;
  renderScale: number;
  factor: number;
  bpm: number | null;
}

/**
 * Native stub. Metro picks ShaderLayer.web.tsx on web; everywhere else the
 * shader layer simply is not there.
 *
 * Going native later means implementing exactly this one file against expo-gl
 * (alive and shipping for SDK 55) — the shaders themselves are plain GLSL and
 * port unchanged.
 */
export function ShaderLayer(_props: ShaderLayerProps): null {
  return null;
}
