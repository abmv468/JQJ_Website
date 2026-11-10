import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { shippingAndReturnsAccordionText } from "@/components/product/ProductDetail";
import {
  DISPATCH_BUSINESS_DAYS_MAX,
  DISPATCH_BUSINESS_DAYS_MIN,
  RETURNS_DAYS,
  TRANSIT_DAYS_MAX,
  TRANSIT_DAYS_MIN,
} from "@/lib/policy";
import { FREE_SHIPPING_THRESHOLD_USD } from "@/lib/shipping";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function source(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

const ACCORDION_TEXT =
  "Free shipping on orders over $250 · 30-day returns. Dispatched in 1–3 business days, then typically 7–12 days in transit. Customs and peak season can add time. Returns are accepted within 30 days of delivery; return shipping is paid by the customer unless the item arrived damaged or incorrect. See our Returns Policy for details.";

const MADE_TO_ORDER =
  "Custom, resized, or made-to-order pieces may require 5–10 business days before shipment.";

const POLICY_SURFACES = [
  "components/product/ProductDetail.tsx",
  "app/(store)/returns/page.tsx",
  "app/(store)/shipping/page.tsx",
  "lib/policy.ts",
];

describe("shipping and returns policy", () => {
  it("builds the Shipping & Returns accordion from constants", () => {
    expect(RETURNS_DAYS).toBe(30);
    expect(DISPATCH_BUSINESS_DAYS_MIN).toBe(1);
    expect(DISPATCH_BUSINESS_DAYS_MAX).toBe(3);
    expect(TRANSIT_DAYS_MIN).toBe(7);
    expect(TRANSIT_DAYS_MAX).toBe(12);
    expect(FREE_SHIPPING_THRESHOLD_USD).toBe(250);

    expect(shippingAndReturnsAccordionText(FREE_SHIPPING_THRESHOLD_USD)).toBe(ACCORDION_TEXT);

    const productDetail = source("components/product/ProductDetail.tsx");
    expect(productDetail).toContain('title: "Shipping & Returns"');
    expect(productDetail).toContain(
      "shippingAndReturnsAccordionText(FREE_SHIPPING_THRESHOLD_USD)"
    );
    expect(productDetail).toContain('href="/returns"');
    expect(productDetail).toContain('const RETURNS_POLICY_LABEL = "Returns Policy"');
    expect(productDetail).toContain("{RETURNS_POLICY_LABEL}");
    expect(productDetail).toContain("${DISPATCH_BUSINESS_DAYS_MIN}–${DISPATCH_BUSINESS_DAYS_MAX}");
    expect(productDetail).toContain("${TRANSIT_DAYS_MIN}–${TRANSIT_DAYS_MAX}");
    expect(productDetail).toContain("${RETURNS_DAYS}");
    expect(productDetail).toContain("$${freeShippingThresholdUsd}");
    expect(source("lib/policy.ts")).not.toContain("FREE_SHIPPING_THRESHOLD_USD");
  });

  it("keeps the returns window on RETURNS_DAYS and the damaged-item exception", () => {
    const text = source("app/(store)/returns/page.tsx");
    expect(text).toContain(
      "`Return requests must be submitted within ${RETURNS_DAYS} days of delivery.`"
    );
    expect(text).toContain(
      "`Exchange or resize requests for bracelets should be submitted within ${RETURNS_DAYS} days of delivery.`"
    );
    expect(text).toContain(
      "Customers pay return shipping unless the item arrived damaged or incorrect."
    );
    expect(text).not.toMatch(/14 days/);
  });

  it("shows 7–12 day transit, 5–10 day made-to-order, and free shipping over $250", () => {
    const text = source("app/(store)/shipping/page.tsx");
    expect(`typically ${TRANSIT_DAYS_MIN}–${TRANSIT_DAYS_MAX} days`).toBe("typically 7–12 days");
    expect(text).toContain(
      "`Domestic standard shipping: typically ${TRANSIT_DAYS_MIN}–${TRANSIT_DAYS_MAX} days after dispatch.`"
    );
    expect(text).toContain(
      "`International shipping (where available): typically ${TRANSIT_DAYS_MIN}–${TRANSIT_DAYS_MAX} days, excluding customs delays.`"
    );
    expect(text).toContain(MADE_TO_ORDER);
    expect(text).toContain("`Free shipping on orders over $${FREE_SHIPPING_THRESHOLD_USD}.`");
    expect(`Free shipping on orders over $${FREE_SHIPPING_THRESHOLD_USD}.`).toBe(
      "Free shipping on orders over $250."
    );
    expect(text).not.toContain("7–14");
    expect(text).not.toContain("3–7");
  });

  it("does not say Complimentary UPS or first resize", () => {
    for (const relative of POLICY_SURFACES) {
      const text = source(relative);
      expect(text, relative).not.toMatch(/Complimentary UPS/i);
      expect(text, relative).not.toMatch(/first resize/i);
      expect(text, relative).not.toMatch(
        /handmade|hand-made|hand-finished|handcrafted|\batelier\b/i
      );
    }
  });
});
