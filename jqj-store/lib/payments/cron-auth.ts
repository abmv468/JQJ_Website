import { createHash, timingSafeEqual } from "crypto";

export type CronAuthResult = { ok: true } | { ok: false; reason: "missing_secret" | "mismatch" };

function secretsMatch(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

/**
 * Compares the raw Authorization header to `Bearer ${secret}`.
 * An empty or whitespace-only secret is rejected before that comparison.
 * Neither side is trimmed.
 */
export function authorizeCronRequest(header: string | null, secret: string | undefined): CronAuthResult {
  if (secret == null || secret.trim() === "") {
    return { ok: false, reason: "missing_secret" };
  }
  if (!header || !secretsMatch(header, `Bearer ${secret}`)) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true };
}
