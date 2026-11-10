import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { products } from "@/data/products";
import { RETURNS_DAYS } from "@/lib/policy";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const TRUST_LINE = "Hand-finished natural stone jewellery · Secure checkout";

/** Longer phrases first so a short allowed form cannot hide a disallowed one. */
const APPROVED_HERITAGE = [
  "Museum-inspired craftsmanship since 2015",
  "Handmade natural stone jewellery since 2015, with museum collaborations",
  "Crafting natural stone jewellery since 2015.",
  "Since 2015 · Museum collaborations",
  "Our work includes museum collaborations.",
  "Crafted and finished by hand in our atelier.",
  "Crafted in our atelier",
  "Join our list for new pieces and atelier news.",
  "Since 2015",
];

const INFLATED_CLAIMS = [
  /world-renowned/i,
  /museum-grade/i,
  /award-winning/i,
  /master artisans/i,
  /as seen in museums/i,
  /in partnership with/i,
  /family atelier/i,
  /museum-inspired restraint/i,
];

const FAKE_REVIEW_MARKERS = [
  /aggregateRating/,
  /reviewCount/,
  /StarRating/,
  /Top Rated/,
  /9929/,
  /4\.8\/5/,
  /Satisfaction Guarantee/,
  /Complimentary UPS/,
  /collector benefits/i,
];

const WINDOW_SOURCES = [
  "components/home/Hero.tsx",
  "components/product/ProductDetail.tsx",
  "app/(store)/returns/page.tsx",
  "app/(store)/faqs/page.tsx",
  "app/(store)/shipping/page.tsx",
];

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      files.push(...walk(full));
      continue;
    }
    if (/\.(ts|tsx|mjs|sql)$/.test(entry)) files.push(full);
  }
  return files;
}

function storefrontSources(): string[] {
  return [
    ...walk(path.join(root, "app")),
    ...walk(path.join(root, "components")),
    ...walk(path.join(root, "data")),
    ...walk(path.join(root, "lib")),
    ...walk(path.join(root, "scripts")),
    path.join(root, "supabase/seed.sql"),
  ];
}

function stripApproved(text: string): string {
  const normalized = text.replace(/\s+/g, " ");
  return APPROVED_HERITAGE.reduce((rest, phrase) => rest.replaceAll(phrase, ""), normalized);
}

describe("trust copy", () => {
  it("uses the confirmed 30-day return window", () => {
    expect(RETURNS_DAYS).toBe(30);
  });

  it("renders the return window from RETURNS_DAYS", () => {
    for (const relative of WINDOW_SOURCES) {
      const source = readFileSync(path.join(root, relative), "utf8");
      expect(source, relative).toContain("RETURNS_DAYS");
      expect(source, relative).not.toMatch(/14 days/);
      expect(source, relative).not.toMatch(/\$\{14\}/);
    }
  });

  it("keeps the approved hero trust line", () => {
    const hero = readFileSync(path.join(root, "components/home/Hero.tsx"), "utf8");
    expect(hero).toContain(TRUST_LINE);
    expect(hero).not.toMatch(/Free shipping/i);
    expect(hero).not.toMatch(/worldwide/i);
  });

  it("does not publish fabricated ratings", () => {
    for (const product of products) {
      expect(product).not.toHaveProperty("rating");
      expect(product).not.toHaveProperty("reviewCount");
      expect(product.tags).not.toContain("top-rated");
      expect(product.features).toContain("Crafted in our atelier");
      expect(product.features.join(" ")).not.toMatch(/museum/i);
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

  it("allows heritage claims only in the approved wording", () => {
    for (const file of storefrontSources()) {
      const source = readFileSync(file, "utf8");
      const relative = path.relative(root, file);
      const remainder = stripApproved(source);
      expect(remainder, relative).not.toMatch(
        /in our atelier|from the atelier|family atelier|museum-inspired|museum collaboration|since 2015/i
      );
      for (const pattern of INFLATED_CLAIMS) {
        expect(source, relative).not.toMatch(pattern);
      }
      for (const pattern of FAKE_REVIEW_MARKERS) {
        expect(source, relative).not.toMatch(pattern);
      }
    }
  });

  it("drops the collector-benefits promise on the loyalty page", () => {
    const source = readFileSync(path.join(root, "app/(store)/loyalty/page.tsx"), "utf8");
    expect(source).toContain("Join our list for new pieces and atelier news.");
    expect(source).not.toMatch(/collector benefits/i);
    expect(source).toContain('title: "JQD Group Updates — JQD Group"');
    expect(source).toContain('title="Collector Updates"');
  });

  it("says the customer pays return shipping where returns are described", () => {
    for (const relative of [
      "app/(store)/returns/page.tsx",
      "app/(store)/shipping/page.tsx",
      "app/(store)/faqs/page.tsx",
      "components/product/ProductDetail.tsx",
    ]) {
      const source = readFileSync(path.join(root, relative), "utf8");
      expect(source, relative).toContain("Customers pay return shipping");
      expect(source, relative).not.toMatch(/complimentary .*returns/i);
    }
  });
});
