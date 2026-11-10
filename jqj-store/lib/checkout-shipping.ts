/**
 * Checkout shipping in USD.
 * Free at a merchandise subtotal of $250.00 or more, otherwise $15.00.
 * Amounts are compared in cents so 249.99 does not qualify.
 *
 * PR #16 adds the same rule in lib/shipping.ts. After rebasing onto that
 * branch, import computeShippingUsd from there and remove this file.
 */

export const FREE_SHIPPING_THRESHOLD_USD = 250;
export const SHIPPING_FLAT_USD = 15;

export type MerchandiseLine = {
  unitPriceUsd: number | string;
  quantity: number;
};

function usdToCents(amountUsd: number | string) {
  if (typeof amountUsd === "string") {
    const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(amountUsd.trim());
    if (!match) throw new Error("USD amount must be a finite number");
    const sign = match[1] === "-" ? -1 : 1;
    const dollars = Number(match[2]);
    const centsPart = Number((match[3] ?? "").slice(0, 2).padEnd(2, "0"));
    const cents = dollars * 100 + centsPart;
    if (!Number.isSafeInteger(dollars) || !Number.isSafeInteger(cents)) {
      throw new Error("USD amount is out of range");
    }
    return sign * cents;
  }

  if (typeof amountUsd !== "number" || !Number.isFinite(amountUsd)) {
    throw new Error("USD amount must be a finite number");
  }
  const sign = amountUsd < 0 ? -1 : 1;
  const cents = Math.round(Math.abs(amountUsd) * 100);
  if (!Number.isSafeInteger(cents)) throw new Error("USD amount is out of range");
  return sign * cents;
}

export function computeShippingUsd(
  merchandise: number | string | readonly MerchandiseLine[],
  discountUsd: number | string = 0
) {
  const discountCents = usdToCents(discountUsd);
  if (discountCents < 0) throw new Error("Discount must be zero or positive");

  const merchandiseCents =
    typeof merchandise === "number" || typeof merchandise === "string"
      ? usdToCents(merchandise)
      : merchandise.reduce((sum, line) => {
          const quantity = Math.floor(Number(line.quantity));
          if (!Number.isFinite(quantity) || quantity <= 0) return sum;
          return sum + usdToCents(line.unitPriceUsd) * quantity;
        }, 0);

  if (merchandiseCents - discountCents >= usdToCents(FREE_SHIPPING_THRESHOLD_USD)) return 0;
  return SHIPPING_FLAT_USD;
}

export function sumMerchandiseUsd(lines: readonly MerchandiseLine[]) {
  const cents = lines.reduce((sum, line) => {
    const quantity = Math.floor(Number(line.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) return sum;
    return sum + usdToCents(line.unitPriceUsd) * quantity;
  }, 0);
  return cents / 100;
}
