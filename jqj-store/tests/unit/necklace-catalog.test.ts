import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { products, stones } from "@/data/products";
import { megaMenuLinks, megaMenus } from "@/lib/mega-menu";
import { productsForListingHref, stoneListingHref } from "@/lib/listing";
import { getVariantLabel } from "@/lib/product-stock";

const braceletOnlyFeatures = [
  "Tailored for your preferred fit",
  "Complimentary first resize for new customers",
];

const necklaceMains: Record<string, string> = {
  "pearl-silver-necklace-v": "/products/pearl-silver-necklace.webp",
  "blue-lace-agate-silver-pendant": "/products/blue-lace-agate-pendant.webp",
  "labradorite-silver-pendant": "/products/labradorite-pendant.webp",
};

const droppedBraceletShots = [
  "/products/pearl-silver-necklace-v-1.jpg",
  "/products/pearl-silver-necklace-v-2.jpg",
  "/products/blue-lace-agate-silver-pendant-1.jpg",
  "/products/labradorite-silver-pendant-1.jpg",
];

function productBySlug(slug: string) {
  const product = products.find((entry) => entry.slug === slug);
  if (!product) throw new Error(`Missing product ${slug}`);
  return product;
}

describe("necklace catalog facts", () => {
  it("sets every stone filter from specs.Stone", () => {
    for (const product of products) {
      expect(product.stone, product.slug).toBe(product.specs.Stone);
    }
    expect(productBySlug("blue-lace-agate-silver-pendant").stone).toBe("Blue Lace Agate");
    expect(productBySlug("labradorite-silver-pendant").stone).toBe("Labradorite");
    expect(productBySlug("pearl-silver-necklace-v").stone).toBe("Freshwater Pearl");
    expect(productBySlug("silver-bracelet-iv").stone).toBe("Hematite Silver");
    expect(productBySlug("red-leopard-skin-jasper-bracelet-iii").stone).toBe("Red Leopard Skin Jasper");
  });

  it("lists only stones that have products, and those links are not empty", () => {
    expect(stones.length).toBeGreaterThan(0);
    for (const stone of stones) {
      const owners = products.filter((product) => product.stone === stone);
      expect(owners.length, stone).toBeGreaterThan(0);
      expect(productsForListingHref(stoneListingHref(stone)).length, stone).toBeGreaterThan(0);
    }
    expect(stones).not.toContain("Tiger Eye");
    expect(stones).not.toContain("Carnelian");
    expect(stones).not.toContain("Aquamarine");
    expect(stones).not.toContain("Lapis Lazuli");
  });

  it("keeps bracelet fit and resize copy on bracelets only", () => {
    for (const product of products) {
      for (const feature of braceletOnlyFeatures) {
        if (product.category === "bracelets") {
          expect(product.features, product.slug).toContain(feature);
        } else {
          expect(product.features, product.slug).not.toContain(feature);
        }
      }
    }
  });

  it("records chain length per necklace", () => {
    const blueLace = productBySlug("blue-lace-agate-silver-pendant");
    expect(blueLace.specs["Chain Length"]).toBe("45 cm or 55 cm");
    expect(blueLace.variants?.map((variant) => variant.size)).toEqual(["45 cm", "55 cm"]);

    const labradorite = productBySlug("labradorite-silver-pendant");
    expect(labradorite.specs["Chain Length"]).toBe("55 cm");
    expect(labradorite.variants ?? []).toEqual([]);

    const pearl = productBySlug("pearl-silver-necklace-v");
    expect(pearl.specs["Chain Length"]).toBe("45 cm");
    expect(pearl.variants ?? []).toEqual([]);
  });

  it("records Pearl V hematite spacers and states no clasp on any necklace", () => {
    const pearl = productBySlug("pearl-silver-necklace-v");
    expect(pearl.specs.Spacers).toBe("Hematite");
    expect(pearl.specs.Metal).toBeUndefined();
    expect(pearl.description).toContain("silver-tone hematite");
    expect(JSON.stringify(pearl).toLowerCase()).not.toContain("pending");
    expect(JSON.stringify(pearl).toLowerCase()).not.toContain("clasp");

    for (const product of products.filter((entry) => entry.category === "necklaces")) {
      expect(JSON.stringify(product.specs).toLowerCase(), product.slug).not.toContain("clasp");
      expect(product.description.toLowerCase(), product.slug).not.toContain("clasp");
      expect(product.specs.Origin, product.slug).toBe("Designed in Hong Kong");
      expect(product.features, product.slug).toContain("Designed in Hong Kong");
      expect(product.features.join(" ").toLowerCase(), product.slug).not.toContain("atelier");
    }
  });

  it("describes the Blue Lace pendant as a bar on a curb chain", () => {
    const blueLace = productBySlug("blue-lace-agate-silver-pendant");
    expect(blueLace.description.toLowerCase()).toContain("curb chain");
    expect(blueLace.description.toLowerCase()).toContain("bar");
    expect(blueLace.description.toLowerCase()).not.toMatch(/box chain|teardrop|round pendant|\bpoint\b/);
    for (const [key, value] of Object.entries(blueLace.specs)) {
      const describesShape = /shape|pendant/i.test(key) || /box chain|teardrop|round pendant|curb chain|\bbar\b|\bpoint\b/i.test(value);
      if (!describesShape) continue;
      expect(value.toLowerCase(), key).toContain("bar");
      expect(value.toLowerCase(), key).toContain("curb chain");
    }
  });

  it("does not offer the Blue Lace gold-plated variant", () => {
    const blueLace = productBySlug("blue-lace-agate-silver-pendant");
    const skus = (blueLace.variants ?? []).map((variant) => variant.sku);
    expect(skus).toEqual(["JQJ-BLAPEN-45-SS", "JQJ-BLAPEN-55-SS"]);
    expect(skus).not.toContain("JQJ-BLAPEN-55-GV");
    expect(getVariantLabel(blueLace.variants![0])).toBe("45 cm / Sterling silver");
    expect(getVariantLabel(blueLace.variants![1])).toBe("55 cm / Sterling silver");

    const blob = JSON.stringify(blueLace).toLowerCase();
    expect(blob).not.toContain("gold-plated");
    expect(blob).not.toContain("vermeil");
    expect(blob).not.toContain("karat");
    expect(blob).not.toContain("micron");
    expect(blueLace.specs.Metal).toBe("Sterling silver");
  });

  it("uses each necklace's own photo and drops bracelet shots from the gallery", () => {
    const necklaces = products.filter((product) => product.category === "necklaces");
    expect(necklaces.map((product) => product.slug).sort()).toEqual(Object.keys(necklaceMains).sort());
    for (const product of necklaces) {
      expect(product.images, product.slug).toEqual([necklaceMains[product.slug]]);
      for (const image of product.images) {
        expect(image.toLowerCase(), product.slug).not.toContain("bracelet");
        expect(droppedBraceletShots, product.slug).not.toContain(image);
        expect(fs.existsSync(path.join(process.cwd(), "public", image))).toBe(true);
      }
    }
  });

  it("points the All Necklaces card at a necklace photo, not a bracelet", () => {
    const image = megaMenus.necklaces.card.image;
    expect(Object.values(necklaceMains)).toContain(image);
    expect(image.toLowerCase()).not.toContain("bracelet");
    expect(fs.existsSync(path.join(process.cwd(), "public", image))).toBe(true);
  });

  it("gives every mega-menu link at least one product", () => {
    const links = megaMenuLinks();
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(productsForListingHref(link.href).length, `${link.label} ${link.href}`).toBeGreaterThan(0);
    }
    const labels = links.map((link) => link.label);
    for (const empty of ["Chain Necklaces", "Pendant Necklaces", "Gold", "Rose Gold", "Cool Blues", "Mini Beads"]) {
      expect(labels).not.toContain(empty);
    }
  });
});

describe("catalog seed mirrors the necklace facts", () => {
  const seed = fs.readFileSync(path.join(process.cwd(), "supabase/seed.sql"), "utf8");

  it("does not keep vermeil or the withheld gold-plated variant", () => {
    expect(seed.toLowerCase()).not.toContain("vermeil");
    expect(seed.toLowerCase()).not.toContain("gold-plated");
    expect(seed).not.toContain("JQJ-BLAPEN-55-GV");
    expect(seed).toContain("Freshwater Pearl");
    expect(seed).toContain("45 cm or 55 cm");
    expect(seed).toContain("Designed in Hong Kong");
    expect(seed).toContain("Hematite");
    expect(seed).toContain("curb chain");
    expect(seed.toLowerCase()).not.toContain("sterling silver clasp");
    expect(seed.toLowerCase()).not.toContain("box chain");
    expect(seed).not.toContain("blue-lace-agate-silver-pendant-1.jpg");
    expect(seed).not.toContain("labradorite-silver-pendant-1.jpg");
    expect(seed).not.toContain("pearl-silver-necklace-v-1.jpg");
    expect(seed).toContain("/products/pearl-silver-necklace.webp");
    expect(seed).toContain("/products/blue-lace-agate-pendant.webp");
    expect(seed).toContain("/products/labradorite-pendant.webp");
  });
});
