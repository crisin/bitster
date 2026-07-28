/**
 * Helpers for the user-adjustable side of theming. The actual per-theme
 * config shape and resolution live in look.ts — since themes became presets,
 * "custom" is just the one preset without a palette of its own.
 */

export const CUSTOM_THEME_ID = "custom";

/** Accent swatches offered in the editor (free hex input works too) */
export const ACCENT_PRESETS = [
  "#c9485b", // bitster red
  "#e0245e", // hot pink
  "#ff6fae", // bubblegum
  "#c026ff", // purple
  "#7c5cff", // violet
  "#3b82f6", // blue
  "#00b8d9", // cyan
  "#1db954", // green
  "#3faa9e", // teal
  "#f5a623", // orange
  "#d4af37", // gold
  "#e8e6e3", // silver
];

/** "#rgb" or "#rrggbb" (case-insensitive) → normalized "#rrggbb", else null */
export function normalizeHex(input: string): string | null {
  const value = input.trim().replace(/^#?/, "#");
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const [, r, g, b] = value;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

/**
 * Pool for the "surprise me" dice. Deliberately all astral-plane emoji with no
 * zero-width joiners or variation selectors — those count several UTF-16 units
 * each and would blow past the input's maxLength after two or three picks.
 */
const FLOATIE_POOL = [
  "🎵", "🎸", "🎺", "🥁", "🪩", "💿", "📼", "🎤",
  "🍄", "👽", "👾", "🛸", "🪐", "🚀", "🌈", "🔥",
  "💀", "🎃", "🦖", "🐙", "🦄", "🐸", "🧃", "🍕",
  "🍒", "🌵", "🧿", "🪿", "🫠", "🧊", "🌊", "🍭",
  "🎲", "🕹", "💣", "🧲", "🪄", "🦩", "🐌", "🌻",
];

/** How many the dice picks — expandFloaties doubles sets of five for density */
const RANDOM_FLOATIE_COUNT = 5;

/**
 * A fresh handful of emoji for the floaties field. Returns the raw string the
 * editor stores, so the result stays visible and editable rather than being a
 * hidden "random" mode nobody can pin down.
 */
export function randomFloaties(): string {
  const pool = [...FLOATIE_POOL];
  const picked: string[] = [];
  for (let i = 0; i < RANDOM_FLOATIE_COUNT && pool.length > 0; i++) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool[index]);
    pool.splice(index, 1);
  }
  return picked.join("");
}

/** Split an emoji string into individual floaties (max 6) */
export function parseFloaties(raw: string): string[] | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let parts: string[];
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    parts = [...new Intl.Segmenter().segment(trimmed)].map(
      (s) => s.segment,
    );
  } else {
    parts = Array.from(trimmed);
  }
  const emojis = parts.filter((p) => p.trim().length > 0).slice(0, 6);
  return emojis.length > 0 ? emojis : null;
}
