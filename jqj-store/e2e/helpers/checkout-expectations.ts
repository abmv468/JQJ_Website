/**
 * Playwright entry for the shared amount table.
 * The implementation lives in `tests/shared/checkout-expectations.ts` so
 * Vitest can import the same `quoteCheckout` without loading Playwright.
 */
export {
  checkoutExpectations,
  toCents,
  fromCents,
  formatUsd,
  codFeeDisplay,
  shippingUsd,
  quoteCheckout,
  type CheckoutMethod,
} from "../../tests/shared/checkout-expectations";
