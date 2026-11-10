export const SINGLE_EMAIL_FIELD_MESSAGE = "Enter a valid email address.";

const MAX_SINGLE_EMAIL_LENGTH = 254;

/** Trim surrounding whitespace. Persist and send this value, not the raw input. */
export function normalizeSingleEmail(value: string): string {
  return value.trim();
}

function hasForbiddenCharacter(value: string): boolean {
  if (value.includes(",") || value.includes(";")) return true;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 32 || code === 127 || (code >= 128 && code <= 159)) return true;
  }
  return /\s/u.test(value);
}

/**
 * One mailbox only: local@domain, with a dot in the domain.
 * Rejects extra recipients and header injection after trimming.
 */
export function isValidSingleEmail(value: string): boolean {
  const email = normalizeSingleEmail(value);
  if (email.length === 0 || email.length > MAX_SINGLE_EMAIL_LENGTH) return false;
  if (hasForbiddenCharacter(email)) return false;

  const at = email.indexOf("@");
  if (at <= 0 || email.lastIndexOf("@") !== at) return false;

  const labels = email.slice(at + 1).split(".");
  if (labels.length < 2 || labels.some((label) => label.length === 0)) return false;
  return true;
}
