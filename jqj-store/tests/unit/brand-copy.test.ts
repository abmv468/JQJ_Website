import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DELIVERY_RANGE,
  DELIVERY_SHORT,
  DUTIES_LINE,
  FREE_SHIPPING_OVER_250,
  PDP_SHIPPING_LEAD,
  RETURN_SHIPPING_LINE,
} from "@/lib/brand-copy";
import { products } from "@/data/products";

const BANNED =
  /\b(?:hand-crafted|handcrafted|hand-finished|hand-made|hand made|handmade|craftsmanship|artisanal|artisan|atelier|crafted|craft)\b|worldwide|\bUPS\b/i;

function walkTs(dir: string): string[] {
  const absolute = path.resolve(process.cwd(), dir);
  const files: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const full = path.join(absolute, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkTs(path.relative(process.cwd(), full)));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(path.relative(process.cwd(), full));
    }
  }
  return files;
}

function stringLiterals(source: string): string[] {
  return source.match(/`(?:\\`|[^`])*`|"(?:\\"|[^"\n])*"|'(?:\\'|[^'\n])*'/g) ?? [];
}

const COPY_SOURCES = [...walkTs("app"), ...walkTs("components"), "lib/brand-copy.ts"];

describe("BRAND v4 copy constants", () => {
  it("keeps the standard delivery sentence, including the en dashes", () => {
    expect(DELIVERY_RANGE).toBe(
      "Dispatched in 1–3 business days, then typically 7–12 days in transit. Customs and peak season can add time."
    );
    expect(DELIVERY_RANGE).toContain("1\u20133");
    expect(DELIVERY_RANGE).toContain("7\u201312");
    expect(DELIVERY_RANGE).not.toContain("1-3");
  });

  it("uses the locked free-shipping phrase and the v4.2 product lines", () => {
    expect(FREE_SHIPPING_OVER_250).toBe("Free shipping on orders over $250");
    expect(PDP_SHIPPING_LEAD).toBe("Free shipping on orders over $250 · 30-day returns");
    expect(PDP_SHIPPING_LEAD.startsWith(FREE_SHIPPING_OVER_250)).toBe(true);
    expect(DELIVERY_SHORT).toBe("Tracked delivery · typically 7–12 days after dispatch");
    expect(RETURN_SHIPPING_LINE).toBe("Return shipping is paid by the customer.");
    expect(DUTIES_LINE).toBe(
      "Import duties and taxes may apply on delivery, depending on your country."
    );
  });
});

describe("customer copy sources", () => {
  it("app, components, and brand-copy do not use banned craft words", () => {
    const hits: string[] = [];
    for (const relativePath of COPY_SOURCES) {
      const source = readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
      for (const literal of stringLiterals(source)) {
        if (BANNED.test(literal)) hits.push(`${relativePath}: ${literal}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("catalog copy", () => {
  it("sets Origin to Designed in Hong Kong and drops craft, worldwide, and UPS wording", () => {
    expect(products.length).toBeGreaterThan(0);
    const hits: string[] = [];
    for (const product of products) {
      expect(product.specs.Origin).toBe("Designed in Hong Kong");
      const copy = [
        product.description,
        ...product.features,
        ...Object.entries(product.specs).map(([key, value]) => `${key}: ${value}`),
      ].join("\n");
      if (BANNED.test(copy)) hits.push(`${product.slug}: ${copy.replaceAll("\n", " | ")}`);
    }
    expect(hits).toEqual([]);
  });

  it("does not name a clasp on necklaces", () => {
    const necklaces = products.filter((product) => product.category === "necklaces");
    expect(necklaces.length).toBeGreaterThan(0);
    for (const product of necklaces) {
      expect(product.description.toLowerCase(), product.slug).not.toContain("clasp");
      expect(product.specs.Clasp, product.slug).toBeUndefined();
      expect(product.features, product.slug).toEqual(["Designed in Hong Kong", "Sterling silver"]);
      expect(product.features.join(" "), product.slug).not.toMatch(/complimentary/i);
    }
  });
});
