const DISPLAY_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function readNoticeEmail(
  notice: string | null,
  email: string | null,
  expected: "confirm" | "reset"
): string | null {
  if (notice !== expected) return null;
  const value = (email ?? "").trim();
  if (value.length > 254 || !DISPLAY_EMAIL.test(value)) return null;
  return value;
}

/** Only the two status values this flow already sets. Anything else is ignored. */
export function loginStatusMessage(status: string | null): string | null {
  if (status === "password-updated") {
    return "Password updated. Sign in with your new password.";
  }
  if (status === "email-verified") {
    return "Email verified. You can now sign in.";
  }
  return null;
}
