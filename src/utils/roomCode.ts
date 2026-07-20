// Must match CODE_CHARS in game/logic.ts: no 0, 1, I, O (visually ambiguous)
const VALID_CHARS = /^[A-HJ-NP-Z2-9]+$/;
const CODE_LENGTH = 6;

export function isValidRoomCode(code: string): boolean {
  return code.length === CODE_LENGTH && VALID_CHARS.test(code);
}

export function sanitizeRoomCodeInput(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-HJ-NP-Z2-9]/g, "")
    .slice(0, CODE_LENGTH);
}

/**
 * True when the input contains characters that look like valid ones but are
 * deliberately excluded from generated codes (0/O, 1/I). Used to tell the
 * user why their typed character "disappeared" instead of silently eating it.
 */
export function hasAmbiguousChars(input: string): boolean {
  return /[01IO]/i.test(input);
}
