import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getProductBySlug, products } from "@/data/products";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Parity with DATA-004 v2 prod_fix_prepared.sql */
const DATA_004 = {
  "amethyst-bracelet-xv": {
    images: ["/products/amethyst-bracelet.webp"],
    stone: "Amethyst",
  },
  "raw-brown-tourmaline-bracelet-i": {
    images: ["/products/brown-tourmaline-bracelet.webp"],
    stone: "Brown Tourmaline",
  },
  "sodalite-bracelet-viii": {
    images: ["/products/sodalite-bracelet.webp"],
    stone: "Sodalite",
  },
  "silver-bracelet-iv": {
    images: ["/products/silver-bracelet.webp"],
    stone: "Hematite",
  },
  "labradorite-bracelet-v": {
    images: ["/products/labradorite-bracelet.webp"],
    stone: "Labradorite",
  },
  "blue-lace-agate-silver-pendant": {
    images: ["/products/blue-lace-agate-pendant.webp"],
    stone: "Blue Lace Agate",
  },
  "labradorite-silver-pendant": {
    images: ["/products/labradorite-pendant.webp"],
    stone: "Labradorite",
  },
  "pearl-silver-necklace-v": {
    images: ["/products/pearl-silver-necklace.webp"],
    stone: "Freshwater Pearl",
  },
} as const;

describe("catalog parity with DATA-004", () => {
  it("gives each ruled product one studio webp and the common stone name", () => {
    for (const [slug, expected] of Object.entries(DATA_004)) {
      const product = getProductBySlug(slug);
      expect(product, slug).toBeDefined();
      expect(product?.images).toEqual([...expected.images]);
      expect(product?.images[0]).toBe(expected.images[0]);
      expect(product?.hoverImage).toBeUndefined();
      expect(product?.stone).toBe(expected.stone);
    }
  });

  it("stores Hematite without the word silver on Silver Bracelet IV", () => {
    expect(getProductBySlug("silver-bracelet-iv")?.specs.Stone).toBe("Hematite");
    expect(getProductBySlug("silver-bracelet-iv")?.specs.Stone.toLowerCase()).not.toContain("silver");
  });

  it("does not put stockCount on any catalog product or variant", () => {
    const source = readFileSync(path.join(root, "data/products.ts"), "utf8");
    const catalog = source.slice(
      source.indexOf("export const products"),
      source.indexOf("export function getStoneFilters")
    );
    expect(catalog).not.toMatch(/stockCount/);

    for (const product of products) {
      expect(product).not.toHaveProperty("stockCount");
      for (const variant of product.variants ?? []) {
        expect(variant).not.toHaveProperty("stockCount");
      }
    }
  });

  it("keeps Red Leopard and JQJ-BLAPEN-55-GV as they are on main", () => {
    const red = getProductBySlug("red-leopard-skin-jasper-bracelet-iii");
    expect(red?.name).toBe("Red Leopard Skin Jasper Cube Bracelet");
    expect(red?.images).toEqual(["/products/red-leopard-jasper-bracelet.webp"]);
    expect(red?.hoverImage).toBe("/products/red-leopard-jasper-bracelet.webp");
    expect(red?.stone).toBe("Red Leopard Skin Jasper");
    expect(red?.specs.Stone).toBe("Red Leopard Skin Jasper");
    expect(red?.price).toBe(599.99);
    expect(red?.variants).toEqual([
      { size: "Small", material: "Sterling Silver", sku: "JQJ-RLSJ-III-S-SS" },
      { size: "Medium", material: "Sterling Silver", sku: "JQJ-RLSJ-III-M-SS" },
      { size: "Large", material: "Sterling Silver", sku: "JQJ-RLSJ-III-L-SS" },
    ]);

    const blueLace = getProductBySlug("blue-lace-agate-silver-pendant");
    expect(blueLace?.price).toBe(249.99);
    expect(blueLace?.variants).toEqual([
      { size: "45cm", material: "Sterling Silver", sku: "JQJ-BLAPEN-45-SS" },
      { size: "55cm", material: "Sterling Silver", sku: "JQJ-BLAPEN-55-SS" },
      { size: "55cm", material: "Gold Vermeil", sku: "JQJ-BLAPEN-55-GV" },
    ]);
  });
});
