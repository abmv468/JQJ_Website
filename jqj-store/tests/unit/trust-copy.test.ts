import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { products } from "@/data/products";
import {
  BRACELETS_SUBTITLE,
  CATALOG_FEATURE_LINE,
  HERO_SUPPORTING,
  HOME_EYEBROW,
  HOME_LEAD,
  LOYALTY_INTRO,
  RETURNS_DAYS,
  SITE_DESCRIPTION,
  TRUST_LINE,
} from "@/lib/policy";

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

  it("leaves BRAND v4 slots empty so pending wording is not shown", () => {
    expect(TRUST_LINE).toBe("");
    expect(HERO_SUPPORTING).toBe("");
    expect(HOME_EYEBROW).toBe("");
    expect(HOME_LEAD).toBe("");
    expect(BRACELETS_SUBTITLE).toBe("");
    expect(CATALOG_FEATURE_LINE).toBe("");
    expect(SITE_DESCRIPTION).toBe("");
    expect(LOYALTY_INTRO).toBe("");
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
    expect(source("components/home/Hero.tsx")).toContain("TRUST_LINE");
    expect(source("components/home/Hero.tsx")).toContain("Museum-inspired craftsmanship since 2015");
  });

  it("drops the collector-benefits promise without a new intro", () => {
    const text = source("app/(store)/loyalty/page.tsx");
    expect(text).toContain("Use the newsletter form in the footer to receive updates.");
    expect(text).not.toMatch(/collector benefits/i);
    expect(text).toContain('title: "JQD Group Updates — JQD Group"');
    expect(text).toContain('title="Collector Updates"');
    expect(text).toContain("LOYALTY_INTRO");
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
