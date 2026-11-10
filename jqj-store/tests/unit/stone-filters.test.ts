import { describe, expect, it } from "vitest";
import { getStoneFilters, products, type Product } from "@/data/products";

describe("stone filters derived from products", () => {
  it("lists every non-empty stone, sorted, and can scope by category", () => {
    expect(getStoneFilters()).toEqual([
      "Amethyst",
      "Blue Lace Agate",
      "Brown Tourmaline",
      "Freshwater Pearl",
      "Hematite",
      "Labradorite",
      "Red Leopard Skin Jasper",
      "Sodalite",
    ]);

    expect(getStoneFilters(products, "bracelets")).toEqual([
      "Amethyst",
      "Brown Tourmaline",
      "Hematite",
      "Labradorite",
      "Red Leopard Skin Jasper",
      "Sodalite",
    ]);

    expect(getStoneFilters(products, "necklaces")).toEqual([
      "Blue Lace Agate",
      "Freshwater Pearl",
      "Labradorite",
    ]);
  });

  it("drops blank stones and keeps a category filter from leaking other departments", () => {
    const sample = [
      { stone: "  ", category: "bracelets" },
      { stone: "Hematite", category: "bracelets" },
      { stone: "Freshwater Pearl", category: "necklaces" },
    ] as const satisfies readonly Pick<Product, "stone" | "category">[];

    expect(getStoneFilters(sample, "bracelets")).toEqual(["Hematite"]);
  });

  it("returns both Labradorite products when that stone is selected", () => {
    const matches = products.filter((product) => product.stone === "Labradorite");
    expect(matches.map((product) => product.slug).sort()).toEqual([
      "labradorite-bracelet-v",
      "labradorite-silver-pendant",
    ]);
    expect(getStoneFilters(products, "bracelets")).toContain("Labradorite");
    expect(getStoneFilters(products, "necklaces")).toContain("Labradorite");
    expect(getStoneFilters(products, "bracelets")).toContain("Red Leopard Skin Jasper");
  });
});
