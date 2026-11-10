import { normalizeCurrency, type SupportedCurrency } from "@/lib/currency";
import { formatPrice } from "@/lib/utils";

/** Currency checkout actually charges. Display FX is not applied to the summary. */
export const CHECKOUT_CHARGE_CURRENCY = "USD" as const satisfies SupportedCurrency;

export interface CheckoutSummaryItem {
  name: string;
  /** Server/catalog unit price in USD. Client-sent amounts are not a source. */
  unitPriceUsd: number;
  quantity: number;
}

export interface CheckoutSummaryLine {
  name: string;
  quantity: number;
  amountUsd: number;
  formatted: string;
}

export interface CheckoutSummary {
  currency: typeof CHECKOUT_CHARGE_CURRENCY;
  lines: CheckoutSummaryLine[];
  subtotalUsd: number;
  shippingUsd: number;
  codFeeUsd: number;
  totalUsd: number;
  subtotal: string;
  shipping: string;
  codFee: string;
  total: string;
  /** Shown beside the total when the shopper's display currency is not USD. */
  chargeNote: string | null;
}

export function formatCheckoutCharge(amountUsd: number): string {
  return formatPrice(amountUsd, { currency: CHECKOUT_CHARGE_CURRENCY });
}

export function checkoutChargeNote(displayCurrency: string | null | undefined): string | null {
  if (normalizeCurrency(displayCurrency) === CHECKOUT_CHARGE_CURRENCY) return null;
  return "Charged in USD";
}

/**
 * Formats a checkout summary entirely in the charged currency.
 * `shippingUsd` and `codFeeUsd` are supplied by the caller; this does not
 * decide whether shipping is free or what the COD fee is.
 */
export function buildCheckoutSummary(input: {
  items: CheckoutSummaryItem[];
  shippingUsd: number;
  codFeeUsd: number;
  displayCurrency?: string | null;
}): CheckoutSummary {
  const lines = input.items.map((item) => {
    const amountUsd = item.unitPriceUsd * item.quantity;
    return {
      name: item.name,
      quantity: item.quantity,
      amountUsd,
      formatted: formatCheckoutCharge(amountUsd),
    };
  });
  const subtotalUsd = lines.reduce((sum, line) => sum + line.amountUsd, 0);
  const shippingUsd = input.shippingUsd;
  const codFeeUsd = input.codFeeUsd;
  const totalUsd = subtotalUsd + shippingUsd + codFeeUsd;

  return {
    currency: CHECKOUT_CHARGE_CURRENCY,
    lines,
    subtotalUsd,
    shippingUsd,
    codFeeUsd,
    totalUsd,
    subtotal: formatCheckoutCharge(subtotalUsd),
    shipping: formatCheckoutCharge(shippingUsd),
    codFee: formatCheckoutCharge(codFeeUsd),
    total: formatCheckoutCharge(totalUsd),
    chargeNote: checkoutChargeNote(input.displayCurrency),
  };
}
