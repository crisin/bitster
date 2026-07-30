/**
 * Shader resolution presets. Rendering at a fraction of the viewport and
 * letting the browser scale the canvas up is by far the biggest performance
 * lever — a fragment shader's cost is almost exactly the pixel count, so half
 * the scale is a quarter of the work.
 *
 * Deliberately a user setting rather than an auto-detect: a party app that
 * silently looks different on everyone's phone is worse than one where the
 * person holding the phone decides.
 */
export const SHADER_QUALITIES = [
  { id: "potato", label: "🥔 Potato", scale: 0.35 },
  { id: "low", label: "Low", scale: 0.5 },
  { id: "medium", label: "Medium", scale: 0.7 },
  { id: "high", label: "🔥 High", scale: 1 },
] as const;

export type ShaderQualityId = (typeof SHADER_QUALITIES)[number]["id"];

export const DEFAULT_SHADER_QUALITY_ID: ShaderQualityId = "medium";

export function getShaderScale(id: string): number {
  return (
    SHADER_QUALITIES.find((q) => q.id === id)?.scale ??
    SHADER_QUALITIES.find((q) => q.id === DEFAULT_SHADER_QUALITY_ID)!.scale
  );
}

/**
 * Simulation presets (reaction-diffusion, SmoothLife, Lenia) burn their
 * budget in ITERATIONS per frame, not just pixels — so the low quality tiers
 * halve those too. Resolution × iterations is the full cost, and quality is
 * the one user-facing lever for both.
 */
export function getSimIterationScale(id: string): number {
  return id === "potato" || id === "low" ? 0.5 : 1;
}
