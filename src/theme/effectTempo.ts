/**
 * How fast the animated theme effects run (rainbow wash, swirl, pulse,
 * floaties). Either a named preset or "bpm" — there the speed follows a
 * beats-per-minute value the user types or taps in. Spotify's audio-features
 * endpoint (real per-song BPM) is gone for dev-mode apps since Nov 2024, so
 * tap-tempo IS the auto-BPM: tap along with the song, done.
 */

export interface EffectSpeedOption {
  id: string;
  name: string;
  /** Animation speed multiplier (1 = the hand-tuned base timings) */
  factor: number;
}

export const DEFAULT_EFFECT_SPEED_ID = "normal";
export const DEFAULT_EFFECT_BPM = 120;

export const BPM_SPEED_ID = "bpm";
export const MIN_BPM = 40;
export const MAX_BPM = 220;

/** Free-slider mode — the factor comes from the user's slider position */
export const CUSTOM_SPEED_ID = "custom";
export const MIN_FACTOR = 0.25;
export const MAX_FACTOR = 4;

export function clampFactor(factor: number): number {
  if (!Number.isFinite(factor)) return 1;
  return Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, factor));
}

export const EFFECT_SPEEDS: EffectSpeedOption[] = [
  { id: "slow", name: "🐌 Chill", factor: 0.5 },
  { id: "normal", name: "Normal", factor: 1 },
  { id: "fast", name: "⚡ Fast", factor: 1.75 },
  { id: "hyper", name: "🚀 Hyper", factor: 3 },
  // The BPM factor is resolved against 120 BPM = "normal"
  { id: BPM_SPEED_ID, name: "🥁 BPM", factor: 1 },
];

export function getEffectSpeed(id: string): EffectSpeedOption | undefined {
  return EFFECT_SPEEDS.find((s) => s.id === id);
}

export interface EffectTempo {
  /** Multiplier applied to all effect animation speeds */
  factor: number;
  /** Set only in BPM mode — lets beat-locked effects hit the beat exactly */
  bpm: number | null;
}

export function resolveEffectTempo(
  speedId: string,
  bpm: number,
  customFactor = 1,
): EffectTempo {
  if (speedId === BPM_SPEED_ID) {
    const clamped = clampBpm(bpm);
    return { factor: clamped / DEFAULT_EFFECT_BPM, bpm: clamped };
  }
  if (speedId === CUSTOM_SPEED_ID) {
    return { factor: clampFactor(customFactor), bpm: null };
  }
  return { factor: getEffectSpeed(speedId)?.factor ?? 1, bpm: null };
}

export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return DEFAULT_EFFECT_BPM;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
}

/**
 * Tap-tempo: median interval of the recent taps → BPM. Median instead of
 * mean so one sloppy tap doesn't wreck the reading. Returns null until two
 * taps landed close enough together to mean something.
 */
export function bpmFromTaps(tapTimestamps: number[]): number | null {
  const taps = tapTimestamps.slice(-8);
  if (taps.length < 2) return null;
  const intervals: number[] = [];
  for (let i = 1; i < taps.length; i++) {
    const delta = taps[i] - taps[i - 1];
    // Ignore pauses — the user stopped tapping and started again
    if (delta > 0 && delta < 2000) intervals.push(delta);
  }
  if (intervals.length === 0) return null;
  intervals.sort((a, b) => a - b);
  const mid = Math.floor(intervals.length / 2);
  const median =
    intervals.length % 2 === 0
      ? (intervals[mid - 1] + intervals[mid]) / 2
      : intervals[mid];
  return clampBpm(60000 / median);
}
