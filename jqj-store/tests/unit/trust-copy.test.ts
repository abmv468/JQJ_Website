import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { products } from "@/data/products";
import { RETURNS_DAYS } from "@/lib/policy";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const WINDOW_SOURCES = [
  "components/home/Hero.tsx",
  "components/product/ProductDetail.tsx",
  "app/(store)/returns/page.tsx",
  "app/(store)/faqs/page.tsx",
  "app/(store)/shipping/page.tsx",
];

/** Strings this PR must not introduce. Held main copy is separate. */
const NOT_ADDED = [
  "Hand-finished natural stone jewellery · Secure checkout",
  "Join our list for new pieces and atelier news.",
  "Handmade natural stone jewellery since 2015, with museum collaborations.",
  "Hand-finished bracelet designs with carefully selected natural stones. Crafted in our atelier.",
];

function source(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

describe("trust copy", () => {
  it("uses the confirmed 30-day return window", () => {
    expect(RETURNS_DAYS).toBe(30);
  });

  it("does not promise a complimentary first resize in the PDP accordion", () => {
    const detail = source("components/product/ProductDetail.tsx");
    const shipping = detail.slice(detail.indexOf('title: "Shipping & Return"'));
    expect(shipping).not.toMatch(/first resize/i);
    expect(shipping).not.toMatch(/complimentary first resize/i);
    expect(shipping).toContain(
      "Exchange or resize requests for bracelets are accepted within ${RETURNS_DAYS} days of delivery."
    );
  });

  it("renders the return window from RETURNS_DAYS", () => {
    for (const relative of WINDOW_SOURCES) {
      const text = source(relative);
      expect(text, relative).toContain("RETURNS_DAYS");
      expect(text, relative).not.toMatch(/14 days/);
    }
  });

  it("does not publish fabricated ratings", () => {
    for (const product of products) {
      expect(product).not.toHaveProperty("rating");
      expect(product).not.toHaveProperty("reviewCount");
      expect(product.tags).not.toContain("top-rated");
      expect(product.features).toContain("Designed in Hong Kong");
      expect(product.features.join(" ")).not.toMatch(/atelier/i);
      expect(product.specs.Origin).toBe("Designed in Hong Kong");
    }

    const bracelets = products.filter((product) => product.category === "bracelets");
    const necklaces = products.filter((product) => product.category === "necklaces");
    expect(bracelets.length).toBeGreaterThan(0);
    expect(necklaces.length).toBeGreaterThan(0);
    for (const product of bracelets) {
      expect(product.features).toContain("Complimentary first resize for new customers");
    }
    for (const product of necklaces) {
      expect(product.features.join(" ")).not.toMatch(/resize/i);
    }
  });

  it("does not add the withdrawn trust line or new banned wording", () => {
    const files = [
      "app/layout.tsx",
      "components/home/Hero.tsx",
      "components/home/ForgetMassProduced.tsx",
      "app/(store)/bracelets/page.tsx",
      "app/(store)/loyalty/page.tsx",
      "data/products.ts",
      "lib/policy.ts",
      "supabase/seed.sql",
    ];
    for (const relative of files) {
      const text = source(relative);
      for (const phrase of NOT_ADDED) {
        expect(text, `${relative} contains ${phrase}`).not.toContain(phrase);
      }
    }
    expect(source("components/home/Hero.tsx")).not.toContain("TRUST_LINE");
    expect(source("lib/policy.ts")).not.toContain("TRUST_LINE");
    expect(source("components/home/Hero.tsx")).toContain("Museum-inspired craftsmanship since 2015");
  });

  it("uses the v4 loyalty line and does not promise collector benefits", () => {
    const text = source("app/(store)/loyalty/page.tsx");
    expect(text).toContain("Join our list for new pieces and updates.");
    expect(text).not.toMatch(/collector benefits/i);
    expect(text).toContain('title: "JQD Group Updates — JQD Group"');
    expect(text).toContain('title="Collector Updates"');
    expect(text).not.toContain("LOYALTY_INTRO");
  });

  it("says the customer pays return shipping where returns are described", () => {
    for (const relative of [
      "app/(store)/returns/page.tsx",
      "app/(store)/shipping/page.tsx",
      "app/(store)/faqs/page.tsx",
      "components/product/ProductDetail.tsx",
    ]) {
      const text = source(relative);
      expect(text, relative).toContain("Customers pay return shipping");
      expect(text, relative).not.toMatch(/complimentary .*returns/i);
    }
  });
});
