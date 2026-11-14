export const PASSWORDS_DO_NOT_MATCH = "Passwords do not match.";
export const PASSWORD_TOO_SHORT = "Password must be at least 6 characters.";
export const PASSWORD_TOO_EASY = "This password is too easy to guess. Choose a stronger one.";
export const PASSWORD_BREACHED = "This password has appeared in a data breach. Choose a different one.";

const RULES: { test: RegExp; message: string }[] = [
  {
    test: /invalid login credentials/i,
    message: "That email or password is incorrect.",
  },
  {
    test: /email not confirmed/i,
    message: "Confirm your email before signing in. Check your inbox for the confirmation link.",
  },
  {
    test: /already registered|user already exists|already been registered/i,
    message: "An account with this email already exists. Sign in instead.",
  },
  {
    test: /password should be at least|at least 6 characters/i,
    message: PASSWORD_TOO_SHORT,
  },
  {
    test: /data breach|pwned|have i been pwned|hibp|leaked password/i,
    message: PASSWORD_BREACHED,
  },
  {
    test: /weak and easy to guess|too easy to guess|commonly used|weak password/i,
    message: PASSWORD_TOO_EASY,
  },
  {
    test: /invalid email|unable to validate email|email address.*invalid/i,
    message: "Enter a valid email address.",
  },
  {
    test: /rate limit|only request this after|too many requests|security purposes/i,
    message: "Please wait a moment, then try again.",
  },
  {
    test: /signups not allowed|signup.*disabled/i,
    message: "Account creation is unavailable right now. Please try again later.",
  },
  {
    test: /network|fetch failed|failed to fetch|load failed/i,
    message: "We couldn\u2019t reach the server. Check your connection and try again.",
  },
  {
    test: /expired|invalid.*link|otp|token/i,
    message: "This link is invalid or has expired.",
  },
];

function rawMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

/**
 * Plain language for the form. Never returns the caught system string.
 * Unknown failures use the caller’s fallback.
 */
export function plainAuthError(error: unknown, fallback: string): string {
  const raw = rawMessage(error);
  for (const rule of RULES) {
    if (rule.test.test(raw)) return rule.message;
  }
  return fallback;
}
