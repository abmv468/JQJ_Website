/**
 * One checkout amount table for Playwright and Vitest.
 *
 * `quoteCheckout` is the expected server total (catalog subtotal + shipping +
 * COD fee). The browser stub and the real Airwallex/COD route tests both
 * import it. Do not copy the fee or the shipping figure into a spec.
 *
 * The route files still have their own constants. The Vitest cases that call
 * those handlers fail when a route total disagrees with this function.
 *
 * Once PR #14 is on main, import `COD_FEE` from `lib/checkout-fees.ts` and
 * delete `codFeeUsd`. Once PR #16 is on main, import `computeShippingUsd`
 * from `lib/shipping.ts` and delete the local shipping copy.
 *
 * Gift wrap is intentionally unused: nothing on main charges it, and no test
 * asserts it. BE-013/WEB-013 set `giftWrapUsd` and opt a case in.
 */

export type CheckoutMethod = "airwallex" | "cod";

export const checkoutExpectations: {
  /** Flat shipping charged while `freeShippingMinimumUsd` is null. */
  shippingFlatUsd: number;
  /**
   * Subtotal (USD catalog cents) at or above which shipping is 0.
   * Null means checkout still charges `shippingFlatUsd` on every cart.
   * That is main today. Replaced by `computeShippingUsd` when PR #16 lands.
   */
  freeShippingMinimumUsd: number | null;
  /**
   * The storefront announcement's free-shipping subtotal. Parity carts sit on
   * either side of it. It does not waive shipping until `freeShippingMinimumUsd` is set.
   */
  announcedFreeShippingSubtotalUsd: number;
  /**
   * Main's COD fee. The only test copy. PR #14 replaces this with
   * `COD_FEE` imported from `lib/checkout-fees.ts`.
   * A non-zero fee is shown as USD. Zero is shown as "Free" and is not a summary row.
   */
  codFeeUsd: number;
  /** Null until the Owner sets a gift-wrap price. Not added into totals and not asserted. */
  giftWrapUsd: number | null;
} = {
  shippingFlatUsd: 15,
  freeShippingMinimumUsd: null,
  announcedFreeShippingSubtotalUsd: 250,
  codFeeUsd: 20,
  giftWrapUsd: null,
};

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Visible COD fee copy. PR #14 only changes `codFeeUsd`; zero becomes "Free". */
export function codFeeDisplay(feeUsd: number = checkoutExpectations.codFeeUsd): string {
  if (toCents(feeUsd) === 0) return "Free";
  return formatUsd(feeUsd);
}

export function shippingUsd(subtotalUsd: number): number {
  const minimum = checkoutExpectations.freeShippingMinimumUsd;
  if (minimum != null && toCents(subtotalUsd) >= toCents(minimum)) return 0;
  return checkoutExpectations.shippingFlatUsd;
}

export function quoteCheckout(
  lines: { unitPriceUsd: number; quantity: number }[],
  method: CheckoutMethod,
  options?: { giftWrap?: boolean }
): { subtotal: number; shipping: number; codFee: number; total: number } {
  if (options?.giftWrap) {
    throw new Error(
      "Gift wrap is not charged on main. Set checkoutExpectations.giftWrapUsd and thread it through quoteCheckout from the BE-013/WEB-013 tests."
    );
  }

  const subtotalCents = lines.reduce(
    (sum, line) => sum + toCents(line.unitPriceUsd) * line.quantity,
    0
  );
  const subtotal = fromCents(subtotalCents);
  const shippingCents = toCents(shippingUsd(subtotal));
  const codFeeCents = method === "cod" ? toCents(checkoutExpectations.codFeeUsd) : 0;
  const totalCents = subtotalCents + shippingCents + codFeeCents;

  return {
    subtotal,
    shipping: fromCents(shippingCents),
    codFee: fromCents(codFeeCents),
    total: fromCents(totalCents),
  };
}
