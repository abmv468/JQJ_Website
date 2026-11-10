import { beforeEach, describe, expect, it } from "vitest";
import {
  cartFingerprint,
  markCheckoutAttemptSucceeded,
  resolveCheckoutAttempt,
  type AttemptStorage,
  type CheckoutAttemptItem,
} from "@/lib/checkout-attempt";

class MemoryStorage implements AttemptStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const bracelet: CheckoutAttemptItem = {
  id: "prod-amethyst",
  slug: "amethyst-bracelet-xv",
  sku: "JQJ-AMETH-XV",
  quantity: 1,
  size: "5mm",
  material: null,
};

describe("checkout attempt idempotency key", () => {
  let storage: MemoryStorage;
  let issued = 0;

  beforeEach(() => {
    storage = new MemoryStorage();
    issued = 0;
  });

  function nextKey() {
    issued += 1;
    return `00000000-0000-4000-8000-00000000000${issued}`;
  }

  it("reuses the key for an unchanged cart and rotates it when the cart changes", () => {
    const first = resolveCheckoutAttempt([bracelet], storage, nextKey);
    const reordered = resolveCheckoutAttempt(
      [{ ...bracelet, material: null, size: "5mm" }],
      storage,
      nextKey
    );
    const sameContents = resolveCheckoutAttempt([bracelet], storage, nextKey);

    expect(first.rotated).toBe(true);
    expect(reordered.rotated).toBe(false);
    expect(sameContents.rotated).toBe(false);
    expect(sameContents.idempotencyKey).toBe(first.idempotencyKey);
    expect(cartFingerprint([bracelet])).toBe(cartFingerprint([{ ...bracelet }]));

    const changed = resolveCheckoutAttempt([{ ...bracelet, quantity: 2 }], storage, nextKey);
    expect(changed.rotated).toBe(true);
    expect(changed.idempotencyKey).not.toBe(first.idempotencyKey);

    const stillChanged = resolveCheckoutAttempt([{ ...bracelet, quantity: 2 }], storage, nextKey);
    expect(stillChanged.rotated).toBe(false);
    expect(stillChanged.idempotencyKey).toBe(changed.idempotencyKey);
  });

  it("keeps the key after a pending or failed return and rotates it after terminal success", () => {
    const first = resolveCheckoutAttempt([bracelet], storage, nextKey);
    const afterPendingOrFailed = resolveCheckoutAttempt([bracelet], storage, nextKey);
    expect(afterPendingOrFailed.idempotencyKey).toBe(first.idempotencyKey);
    expect(afterPendingOrFailed.rotated).toBe(false);

    markCheckoutAttemptSucceeded(storage);
    const afterSuccess = resolveCheckoutAttempt([bracelet], storage, nextKey);
    expect(afterSuccess.rotated).toBe(true);
    expect(afterSuccess.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(afterSuccess.paymentIntentId).toBeUndefined();
  });
});
