const VALID_CHARS = /^[A-Z2-9]+$/;
const CODE_LENGTH = 6;

export function isValidRoomCode(code: string): boolean {
  return code.length === CODE_LENGTH && VALID_CHARS.test(code);
}

export function sanitizeRoomCodeInput(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, "")
    .slice(0, CODE_LENGTH);
}
