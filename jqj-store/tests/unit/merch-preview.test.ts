import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  catalogStoneHref,
  getCatalogStones,
  getLimitedEditionProducts,
  getNewArrivals,
  getProductBySlug,
  paymentTestListingHidden,
  products,
  stoneRawImage,
} from "@/data/products";
import { displayedSpecs } from "@/lib/product-specs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const RETIRED_STONES = ["Carnelian", "Aquamarine", "Lapis Lazuli", "Tiger Eye"];
const DROPPED_FILES = [
  "blue-lace-agate-silver-pendant-1.jpg",
  "labradorite-silver-pendant-1.jpg",
  "pearl-silver-necklace-v-1.jpg",
  "pearl-silver-necklace-v-2.jpg",
  "labradorite-bracelet-v-1.jpg",
  "raw-brown-tourmaline-bracelet-i-2.jpg",
  "raw-brown-tourmaline-bracelet-i-3.jpg",
  "red-leopard-skin-jasper-bracelet-iii-3.jpg",
  "JQJ-Group-—-Natural-Stone-Jewelry-with-Cultural-Craft_Photoshoot_Vintage-Sunwashed-Film_2026-06-29_1x.png",
];
const HELD_LOOPED_S = [
  "amethyst-bracelet.webp",
  "red-leopard-jasper-bracelet.webp",
  "sodalite-bracelet.webp",
  "silver-bracelet.webp",
];

function bySlug(slug: string) {
  const product = products.find((item) => item.slug === slug);
  if (!product) throw new Error(`missing ${slug}`);
  return product;
}

describe("merchandising preview", () => {
  it("corrects the six stone chips and retires chips with no remaining SKU", () => {
    expect(bySlug("red-leopard-skin-jasper-bracelet-iii").stone).toBe("Jasper");
    expect(bySlug("labradorite-bracelet-v").stone).toBe("Labradorite");
    expect(bySlug("labradorite-silver-pendant").stone).toBe("Labradorite");
    expect(bySlug("blue-lace-agate-silver-pendant").stone).toBe("Agate");
    expect(bySlug("blue-lace-agate-silver-pendant").name).toBe("Blue Lace Agate Silver Pendant");
    expect(bySlug("silver-bracelet-iv").stone).toBe("Hematite Silver");
    expect(bySlug("silver-bracelet-iv").specs.Stone).toBe("Hematite Silver");
    expect(bySlug("pearl-silver-necklace-v").stone).toBe("Pearl");
    expect(bySlug("raw-brown-tourmaline-bracelet-i").stone).toBe("Tourmaline");
    expect(bySlug("sodalite-bracelet-viii").stone).toBe("Sodalite");
    expect(bySlug("amethyst-bracelet-xv").stone).toBe("Amethyst");

    const sold = new Set(products.map((product) => product.stone));
    for (const retired of RETIRED_STONES) expect(sold.has(retired)).toBe(false);
    expect(getCatalogStones()).toEqual([
      "Sodalite",
      "Tourmaline",
      "Amethyst",
      "Jasper",
      "Labradorite",
      "Hematite Silver",
      "Agate",
      "Pearl",
    ]);
  });

  it("points stone tiles at category filters and only uses existing raws", () => {
    expect(catalogStoneHref("Sodalite")).toBe("/bracelets?stone=Sodalite");
    expect(catalogStoneHref("Jasper")).toBe("/bracelets?stone=Jasper");
    expect(catalogStoneHref("Agate")).toBe("/necklaces?stone=Agate");
    expect(catalogStoneHref("Pearl")).toBe("/necklaces?stone=Pearl");
    expect(catalogStoneHref("Hematite Silver")).toBe("/bracelets?stone=Hematite%20Silver");
    // No public URL lists the Labradorite bracelet and pendant together.
    expect(catalogStoneHref("Labradorite")).toBe("/bracelets?stone=Labradorite");

    expect(stoneRawImage("Sodalite")).toBe("/stones/sodalite-raw.webp");
    expect(stoneRawImage("Tourmaline")).toBe("/stones/tourmaline-raw.webp");
    expect(stoneRawImage("Amethyst")).toBe("/stones/amethyst-raw.webp");
    for (const stone of ["Jasper", "Labradorite", "Hematite Silver", "Agate", "Pearl"]) {
      expect(stoneRawImage(stone)).toBeUndefined();
      expect(existsSync(path.join(root, "public/stones", `${stone.toLowerCase().replace(/\s+/g, "-")}-raw.webp`))).toBe(
        false,
      );
    }
  });

  it("binds Blue Lace chain length and metal to the selected variant", () => {
    const product = bySlug("blue-lace-agate-silver-pendant");
    const specs = Object.fromEntries(
      displayedSpecs(product.specs, { size: "45cm", material: "Gold Vermeil" }),
    );
    expect(specs["Chain Length"]).toBe("45cm");
    expect(specs.Metal).toBe("Gold Vermeil");
    expect(specs.Stone).toBe("Blue Lace Agate");

    const untouched = Object.fromEntries(displayedSpecs(product.specs, null));
    expect(untouched["Chain Length"]).toBe("55cm");
    expect(untouched.Metal).toBe("Sterling Silver");
  });

  it("keeps /new to products tagged new and counts those cards", () => {
    const arrivals = getNewArrivals();
    expect(arrivals.map((product) => product.slug).sort()).toEqual([
      "amethyst-bracelet-xv",
      "blue-lace-agate-silver-pendant",
      "raw-brown-tourmaline-bracelet-i",
    ]);
    expect(arrivals.every((product) => product.tags.includes("new"))).toBe(true);
    expect(arrivals.some((product) => product.slug === "labradorite-bracelet-v")).toBe(false);
    expect(arrivals.some((product) => product.slug === "pearl-silver-necklace-v")).toBe(false);
    expect(arrivals.some((product) => product.slug === "red-leopard-skin-jasper-bracelet-iii")).toBe(false);
    expect(arrivals).toHaveLength(3);
  });

  it("includes the limited necklace on the limited destination", () => {
    const limited = getLimitedEditionProducts();
    expect(limited.map((product) => product.slug).sort()).toEqual([
      "amethyst-bracelet-xv",
      "labradorite-bracelet-v",
      "pearl-silver-necklace-v",
    ]);
    const bracelets = readFileSync(path.join(root, "app/(store)/bracelets/page.tsx"), "utf8");
    expect(bracelets).toContain('searchParams.tag === "limited"');
    expect(bracelets).toContain("getLimitedEditionProducts()");
    const header = readFileSync(path.join(root, "components/layout/Header.tsx"), "utf8");
    expect(header).toContain('href: "/bracelets?tag=limited"');
  });

  it("promotes the five packshots and drops the wrong gallery files", () => {
    expect(bySlug("blue-lace-agate-silver-pendant").images).toEqual([
      "/products/blue-lace-agate-pendant.webp",
    ]);
    expect(bySlug("labradorite-silver-pendant").images).toEqual(["/products/labradorite-pendant.webp"]);
    expect(bySlug("pearl-silver-necklace-v").images).toEqual(["/products/pearl-silver-necklace.webp"]);
    expect(bySlug("labradorite-bracelet-v").images).toEqual(["/products/labradorite-bracelet.webp"]);
    expect(bySlug("raw-brown-tourmaline-bracelet-i").images).toEqual([
      "/products/brown-tourmaline-bracelet.webp",
    ]);

    const gallery = products.flatMap((product) => product.images);
    for (const file of DROPPED_FILES) {
      expect(gallery.some((image) => image.endsWith(file))).toBe(false);
    }
    expect(bySlug("red-leopard-skin-jasper-bracelet-iii").images).not.toContain(
      "/products/red-leopard-jasper-bracelet.webp",
    );
  });

  it("leaves held defaults and the payment-test listing alone", () => {
    expect(bySlug("amethyst-bracelet-xv").images[0]).toBe("/products/amethyst-bracelet-xv-1.jpg");
    expect(bySlug("sodalite-bracelet-viii").images[0]).toBe("/products/sodalite-bracelet-viii-1.jpg");
    expect(bySlug("silver-bracelet-iv").images[0]).toBe("/products/silver-bracelet-iv-2.jpg");
    expect(bySlug("red-leopard-skin-jasper-bracelet-iii").images[0]).toBe(
      "/products/red-leopard-skin-jasper-bracelet-iii-2.jpg",
    );
    const defaults = products.map((product) => product.images[0]);
    for (const file of HELD_LOOPED_S) {
      expect(defaults.some((image) => image.endsWith(file))).toBe(false);
    }
    expect(paymentTestListingHidden).toBe(true);
    expect(getProductBySlug("payment-test-do-not-ship")).toBeUndefined();
  });

  it("points Latest Collections tiles at filtered destinations", () => {
    const collections = readFileSync(
      path.join(root, "components/home/LatestCollections.tsx"),
      "utf8",
    );
    expect(collections).toContain('href: "/bracelets?stone=Sodalite"');
    expect(collections).toContain('href: "/bracelets?stone=Tourmaline"');
    expect(collections).toContain('href: "/bracelets?stone=Jasper"');
    expect(collections).toContain('href: "/bracelets?stone=Labradorite"');
    expect(collections).toContain('href: "/bracelets?stone=Amethyst"');
    expect(collections).toContain('encodeURIComponent("Hematite Silver")');
    expect(collections).toContain('href: "/necklaces?stone=Pearl"');
    expect(collections).toContain("products[8].images[0]");
    expect(collections).not.toMatch(/href: "\/bracelets",/);
    expect(collections).not.toMatch(/href: "\/necklaces",/);
  });
});
