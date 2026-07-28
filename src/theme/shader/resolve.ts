import { getTripPreset, TRIP_PRESETS } from "./advanced";
import { specFromSimple, specFromUserShader } from "./engine/compile";
import type { EffectSpec } from "./engine/types";
import { FRAGMENT_SHADERS, isShaderPresetId, SHADER_PRESETS } from "./presets";
import type { UserShader } from "./studio";

/**
 * One id space for every kind of shader a look can point at:
 *   - simple presets ("kaleido", …)      — always available
 *   - trip presets ("wormhole", …)       — behind trip mode
 *   - user shaders ("user:<id>")         — from the Studio, behind trip mode
 *
 * The store guarantees trip/user ids only survive while trip mode is on
 * (setTripMode(false) scrubs them), so resolution here needs no gate.
 */

export function isKnownShaderId(
  id: string,
  userShaders: readonly UserShader[],
): boolean {
  if (isShaderPresetId(id)) return true;
  if (getTripPreset(id) !== null) return true;
  if (id.startsWith("user:")) {
    const key = id.slice(5);
    return userShaders.some((s) => s.id === key);
  }
  return false;
}

/** id → runnable spec, or null when the id names nothing (renders as "off") */
export function resolveShaderSpec(
  id: string,
  userShaders: readonly UserShader[],
): EffectSpec | null {
  if (isShaderPresetId(id)) return specFromSimple(id, FRAGMENT_SHADERS[id]);

  const trip = getTripPreset(id);
  if (trip) return trip.spec;

  if (id.startsWith("user:")) {
    const key = id.slice(5);
    const user = userShaders.find((s) => s.id === key);
    if (user) return specFromUserShader(user);
  }
  return null;
}

/** Every selectable id — used by tests to sweep-compile the whole registry */
export function allShaderIds(): string[] {
  return [...SHADER_PRESETS.map((p) => p.id), ...TRIP_PRESETS.map((p) => p.id)];
}
