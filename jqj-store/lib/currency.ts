export const CURRENCY_STORAGE_KEY = "JQJ-currency";
export const CURRENCY_COOKIE_KEY = "JQJ-currency";

export const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

const USD_BASE_RATES: Record<SupportedCurrency, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  AUD: 1.52,
};

export const DEFAULT_CURRENCY: SupportedCurrency = "USD";

export function isSupportedCurrency(value: string | null | undefined): value is SupportedCurrency {
  if (!value) return false;
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value.toUpperCase());
}

export function normalizeCurrency(value: string | null | undefined): SupportedCurrency {
  if (!value) return DEFAULT_CURRENCY;
  const upper = value.toUpperCase();
  return isSupportedCurrency(upper) ? upper : DEFAULT_CURRENCY;
}

export function convertUsdToCurrency(amountUsd: number, currency: SupportedCurrency): number {
  return amountUsd * USD_BASE_RATES[currency];
}

export function convertCurrencyToUsd(amount: number, currency: SupportedCurrency): number {
  return amount / USD_BASE_RATES[currency];
}

export function toStripeCurrency(currency: SupportedCurrency): string {
  return currency.toLowerCase();
}
