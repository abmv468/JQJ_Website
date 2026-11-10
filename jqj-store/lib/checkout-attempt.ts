export const CHECKOUT_ATTEMPT_STORAGE_KEY = "jqd-airwallex-checkout-attempt";

export interface CheckoutAttemptItem {
  id?: string;
  slug?: string;
  sku?: string;
  quantity: number;
  size?: string | null;
  material?: string | null;
}

export interface CheckoutAttemptRecord {
  fingerprint: string;
  idempotencyKey: string;
  paymentIntentId?: string;
  orderId?: string;
  outcome?: "succeeded";
}

export interface AttemptStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ResolvedCheckoutAttempt {
  idempotencyKey: string;
  paymentIntentId?: string;
  orderId?: string;
  rotated: boolean;
}

function blank(value: string | null | undefined) {
  return value ?? "";
}

export function cartFingerprint(items: CheckoutAttemptItem[]) {
  const parts = items
    .map((item) =>
      [
        blank(item.slug),
        blank(item.sku),
        blank(item.id),
        blank(item.size),
        blank(item.material),
        String(Math.max(0, Math.floor(Number(item.quantity) || 0))),
      ].join("\u001f")
    )
    .sort();
  return hashFingerprint(parts.join("\u001e"));
}

function hashFingerprint(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function readCheckoutAttempt(storage: AttemptStorage): CheckoutAttemptRecord | null {
  try {
    const raw = storage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CheckoutAttemptRecord>;
    if (!parsed || typeof parsed.fingerprint !== "string" || typeof parsed.idempotencyKey !== "string") {
      return null;
    }
    return {
      fingerprint: parsed.fingerprint,
      idempotencyKey: parsed.idempotencyKey,
      paymentIntentId: typeof parsed.paymentIntentId === "string" ? parsed.paymentIntentId : undefined,
      orderId: typeof parsed.orderId === "string" ? parsed.orderId : undefined,
      outcome: parsed.outcome === "succeeded" ? "succeeded" : undefined,
    };
  } catch {
    return null;
  }
}

function writeCheckoutAttempt(storage: AttemptStorage, record: CheckoutAttemptRecord) {
  try {
    storage.setItem(CHECKOUT_ATTEMPT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Private browsing can reject sessionStorage. Checkout still proceeds for this submit.
  }
}

/**
 * One key per cart attempt. A pending or failed return keeps the key so a later
 * success stays on the original order. The key rotates when the cart changes
 * or after the attempt has succeeded.
 */
export function resolveCheckoutAttempt(
  items: CheckoutAttemptItem[],
  storage: AttemptStorage,
  createKey: () => string
): ResolvedCheckoutAttempt {
  const fingerprint = cartFingerprint(items);
  const existing = readCheckoutAttempt(storage);
  if (existing && existing.fingerprint === fingerprint && existing.outcome !== "succeeded") {
    return {
      idempotencyKey: existing.idempotencyKey,
      paymentIntentId: existing.paymentIntentId,
      orderId: existing.orderId,
      rotated: false,
    };
  }

  const next: CheckoutAttemptRecord = {
    fingerprint,
    idempotencyKey: createKey(),
  };
  writeCheckoutAttempt(storage, next);
  return { idempotencyKey: next.idempotencyKey, rotated: true };
}

export function rememberCheckoutIntent(
  storage: AttemptStorage,
  input: { paymentIntentId: string; orderId: string }
) {
  const existing = readCheckoutAttempt(storage);
  if (!existing || existing.outcome === "succeeded") return;
  writeCheckoutAttempt(storage, {
    ...existing,
    paymentIntentId: input.paymentIntentId,
    orderId: input.orderId,
  });
}

export function markCheckoutAttemptSucceeded(storage: AttemptStorage) {
  const existing = readCheckoutAttempt(storage);
  if (!existing) return;
  writeCheckoutAttempt(storage, { ...existing, outcome: "succeeded" });
}
