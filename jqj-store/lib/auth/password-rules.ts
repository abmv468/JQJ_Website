/**
 * Local denylist for the reset-page check mark.
 * This is not a live HIBP check and does not call a breached-password API.
 * Auth may still reject a password after submit; those replies are mapped in plain-error.ts.
 */
const COMMON_PASSWORDS = [
  "password",
  "password1",
  "password123",
  "123456",
  "12345678",
  "123456789",
  "qwerty",
  "qwerty123",
  "letmein",
  "admin",
  "welcome",
  "iloveyou",
  "abc123",
  "111111",
  "000000",
  "passw0rd",
] as const;

const COMMON_PASSWORD_SET = new Set<string>(COMMON_PASSWORDS);

export const PASSWORD_MIN_LENGTH = 6;

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORD_SET.has(password.trim().toLowerCase());
}

/** Both lines shown on the reset page: length, then not a common password. */
export function meetsShownPasswordConditions(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && !isCommonPassword(password);
}

/** One check for the whole list. Weak and breached field errors hide it. */
export function showPasswordRequirementCheck(password: string, fieldError: string | null): boolean {
  return meetsShownPasswordConditions(password) && !fieldError;
}
