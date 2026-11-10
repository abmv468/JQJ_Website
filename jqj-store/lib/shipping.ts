/**
 * Pure shipping quote for jqd.app. Safe to import from client components.
 *
 * The merchandise subtotal is the sum of line items in USD after any discount,
 * and before shipping and before any COD fee. Checkout does not apply a
 * discount today: the code field is unwired and every order stores
 * discount_amount as 0, so the threshold sees the catalog line total. Pass
 * discountUsd only when a discount was actually applied; the $250 comparison
 * then uses that post-discount subtotal, matching the banner's "orders over
 * $250" as the merchandise amount the shopper is paying for.
 *
 * Shipping is $0 at or above $250.00 USD and $15.00 otherwise. Comparison is
 * in integer cents, so $249.99 does not round up to $250.00. Pass USD catalog
 * prices, never a display-currency total.
 */

export const FREE_SHIPPING_THRESHOLD_USD = 250;
export const SHIPPING_FLAT_USD = 15;

export type MerchandiseLine = {
  /** USD catalog unit price. Decimal columns may arrive as strings. */
  unitPriceUsd: number | string;
  quantity: number;
};

function fail(message: string): never {
  throw new Error(message);
}

/** Nearest cent, without ever rounding the dollar amount. $249.99 → 24999. */
function usdToCents(amountUsd: number | string): number {
  if (typeof amountUsd === "string") {
    const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(amountUsd.trim());
    if (!match) fail("USD amount must be a finite number");
    const sign = match[1] === "-" ? -1 : 1;
    const dollars = Number(match[2]);
    // Extra digits are truncated. "249.999" stays $249.99, not $250.00.
    const centsPart = Number((match[3] ?? "").slice(0, 2).padEnd(2, "0"));
    const cents = dollars * 100 + centsPart;
    if (!Number.isSafeInteger(dollars) || !Number.isSafeInteger(cents)) {
      fail("USD amount is out of range");
    }
    return sign * cents;
  }

  if (typeof amountUsd !== "number" || !Number.isFinite(amountUsd)) {
    fail("USD amount must be a finite number");
  }
  const sign = amountUsd < 0 ? -1 : 1;
  const cents = Math.round(Math.abs(amountUsd) * 100);
  if (!Number.isSafeInteger(cents)) fail("USD amount is out of range");
  return sign * cents;
}

function merchandiseCents(merchandise: number | string | readonly MerchandiseLine[]): number {
  if (typeof merchandise === "number" || typeof merchandise === "string") {
    return usdToCents(merchandise);
  }

  return merchandise.reduce((sum, line) => {
    const quantity = Math.floor(Number(line.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) return sum;
    return sum + usdToCents(line.unitPriceUsd) * quantity;
  }, 0);
}

/**
 * USD shipping for a merchandise subtotal, or for USD line items summed in cents.
 * `discountUsd` is subtracted before the threshold (post-discount subtotal).
 */
export function computeShippingUsd(
  merchandise: number | string | readonly MerchandiseLine[],
  discountUsd: number | string = 0
): number {
  const discountCents = usdToCents(discountUsd);
  if (discountCents < 0) fail("Discount must be zero or positive");
  const netCents = merchandiseCents(merchandise) - discountCents;
  if (netCents >= usdToCents(FREE_SHIPPING_THRESHOLD_USD)) return 0;
  return SHIPPING_FLAT_USD;
}
