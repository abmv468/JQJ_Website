/**
 * One checkout amount table for Playwright and Vitest.
 *
 * `quoteCheckout` is the expected server total: catalog subtotal, shipping
 * from `computeShippingUsd`, and the COD fee. The browser stub and the real
 * Airwallex/COD route tests both import it. Do not copy a shipping amount
 * into a spec.
 *
 * The COD fee is `COD_FEE` from `lib/checkout-fees.ts`. A zero fee uses the
 * checkout label "Cash on delivery" and is not a summary row.
 *
 * Gift wrap is intentionally unused: nothing on main charges it, and no test
 * asserts it. BE-013/WEB-013 set `giftWrapUsd` and opt a case in.
 */

import { COD_FEE, codPaymentLabel } from "../../lib/checkout-fees";
import { computeShippingUsd, FREE_SHIPPING_THRESHOLD_USD } from "../../lib/shipping";

export { COD_FEE, codPaymentLabel, computeShippingUsd, FREE_SHIPPING_THRESHOLD_USD };

export type CheckoutMethod = "airwallex" | "cod";

export const checkoutExpectations: {
  /** Null until the Owner sets a gift-wrap price. Not added into totals and not asserted. */
  giftWrapUsd: number | null;
} = {
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

/** Visible COD option copy. A zero fee is "Cash on delivery", with no fee row. */
export function codFeeDisplay(feeUsd: number = COD_FEE): string {
  return codPaymentLabel(feeUsd, formatUsd(feeUsd));
}

/** Shipping for a merchandise subtotal, in USD. Delegates to `computeShippingUsd`. */
export function shippingUsd(subtotalUsd: number): number {
  return computeShippingUsd(subtotalUsd);
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
  const shipping = computeShippingUsd(
    lines.map((line) => ({ unitPriceUsd: line.unitPriceUsd, quantity: line.quantity }))
  );
  const shippingCents = toCents(shipping);
  const codFeeCents = method === "cod" ? toCents(COD_FEE) : 0;
  const totalCents = subtotalCents + shippingCents + codFeeCents;

  return {
    subtotal: fromCents(subtotalCents),
    shipping,
    codFee: fromCents(codFeeCents),
    total: fromCents(totalCents),
  };
}
