import { describe, expect, it } from "vitest";
import {
  CARD_NETWORK_LABELS,
  CART_SHIPPING_LINE,
  CASH_ON_DELIVERY_LABEL,
  SECURE_CHECKOUT_LABEL,
  STOCK_CHECK_RETRY_ACTION,
  STOCK_CHECK_RETRY_MESSAGE,
} from "@/lib/cart-copy";

const stripCopy = [
  SECURE_CHECKOUT_LABEL,
  CASH_ON_DELIVERY_LABEL,
  CART_SHIPPING_LINE,
  STOCK_CHECK_RETRY_MESSAGE,
  STOCK_CHECK_RETRY_ACTION,
  ...CARD_NETWORK_LABELS,
].join("\n");

describe("cart trust copy", () => {
  it("uses the v4 checkout and cart lines", () => {
    expect(SECURE_CHECKOUT_LABEL).toBe("Secure checkout");
    expect(CASH_ON_DELIVERY_LABEL).toBe("Cash on delivery");
    expect(CART_SHIPPING_LINE).toBe("Shipping calculated at checkout");
  });

  it("does not claim wallets, worldwide shipping, a carrier, a delivery window, or a COD fee", () => {
    expect(stripCopy).not.toMatch(/apple pay|google pay|paypal|shop pay|worldwide|\bups\b/i);
    expect(stripCopy).not.toMatch(/\d+\s*(?:–|-|to)\s*\d+\s*(?:business\s+)?days/i);
    expect(stripCopy.toLowerCase()).not.toContain("no fee");
    expect(stripCopy.toLowerCase()).not.toContain("fee");
  });

  it("renders no card scheme until Airwallex confirms one", () => {
    expect(CARD_NETWORK_LABELS).toEqual([]);
    expect(stripCopy).not.toMatch(
      /visa|mastercard|american express|amex|unionpay|jcb|discover|diners/i
    );
  });
});
