import { describe, expect, it } from "vitest";
import { convertUsdToCurrency } from "@/lib/currency";
import {
  FREE_SHIPPING_THRESHOLD_USD,
  SHIPPING_FLAT_USD,
  computeShippingUsd,
} from "@/lib/shipping";

const CASES = [
  { usd: 249.99, shipping: SHIPPING_FLAT_USD },
  { usd: 250, shipping: 0 },
  { usd: 499.98, shipping: 0 },
] as const;

describe("computeShippingUsd", () => {
  it.each(CASES)("USD $usd ships at $shipping", ({ usd, shipping }) => {
    expect(computeShippingUsd(usd)).toBe(shipping);
    expect(computeShippingUsd([{ unitPriceUsd: usd, quantity: 1 }])).toBe(shipping);
    expect(computeShippingUsd(String(usd))).toBe(shipping);
  });

  it("does not round $249.99 up to the $250 threshold", () => {
    expect(Math.round(249.99)).toBe(250);
    expect(computeShippingUsd(249.99)).toBe(SHIPPING_FLAT_USD);
    expect(computeShippingUsd("249.99")).toBe(SHIPPING_FLAT_USD);
    expect(computeShippingUsd("249.999")).toBe(SHIPPING_FLAT_USD);
    expect(computeShippingUsd(FREE_SHIPPING_THRESHOLD_USD)).toBe(0);
    expect(computeShippingUsd("250.00")).toBe(0);
  });

  it("sums line items in cents, including a $19.99 float and two $249.99 lines", () => {
    expect(
      computeShippingUsd([
        { unitPriceUsd: 19.99, quantity: 1 },
        { unitPriceUsd: 230, quantity: 1 },
      ])
    ).toBe(SHIPPING_FLAT_USD);
    expect(computeShippingUsd([{ unitPriceUsd: 249.99, quantity: 2 }])).toBe(0);
    expect(computeShippingUsd(499.98)).toBe(0);
  });

  it("applies the threshold to the post-discount merchandise subtotal", () => {
    expect(computeShippingUsd(260, 10)).toBe(0);
    expect(computeShippingUsd(260, 10.01)).toBe(SHIPPING_FLAT_USD);
    expect(computeShippingUsd([{ unitPriceUsd: 300, quantity: 1 }], 50.01)).toBe(SHIPPING_FLAT_USD);
    expect(computeShippingUsd(260, 0)).toBe(0);
  });

  it.each(CASES)(
    "EUR display of USD $usd still decides on the USD subtotal ($shipping)",
    ({ usd, shipping }) => {
      const eurDisplay = convertUsdToCurrency(usd, "EUR");
      const onUsd = computeShippingUsd(usd);
      const ifTheEurFigureWereCompared = eurDisplay >= FREE_SHIPPING_THRESHOLD_USD ? 0 : SHIPPING_FLAT_USD;

      expect(onUsd).toBe(shipping);
      expect(onUsd).toBe(computeShippingUsd([{ unitPriceUsd: usd, quantity: 1 }]));
      expect(eurDisplay).not.toBe(usd);

      if (usd === FREE_SHIPPING_THRESHOLD_USD) {
        expect(eurDisplay).toBeLessThan(FREE_SHIPPING_THRESHOLD_USD);
        expect(ifTheEurFigureWereCompared).toBe(SHIPPING_FLAT_USD);
        expect(onUsd).toBe(0);
      }
    }
  );
});
