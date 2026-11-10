import { describe, expect, it } from "vitest";
import { products, stones } from "@/data/products";

const SLUG = "red-leopard-skin-jasper-bracelet-iii";
const ONLY_IMAGE = "/products/red-leopard-jasper-bracelet.webp";

const NAME = "Red Leopard Skin Jasper Cube Bracelet";
const STONE = "Red Leopard Skin Jasper";
const BEAD_SHAPE = "Cube";
const ACCENT = "One silver-tone cube with an engraved mark";
const DESCRIPTION =
  "Cut into clean cubes, Red Leopard Skin Jasper shows its natural spotted pattern in warm reds, rose, cream and earthy browns, so no two beads look quite alike. Small dark spacers sit between the stones, and a single silver-tone cube with an engraved mark adds a quiet point of light to the strand. Designed in Hong Kong with materials sourced from around the world, it is a considered piece for everyday wear, and arrives gift-ready.";
const IMAGE_ALT =
  "Red Leopard Skin Jasper cube bead bracelet with small dark spacers and one engraved silver-tone cube, on a black background.";
const META_DESCRIPTION =
  "Red Leopard Skin Jasper Cube Bracelet by Jewellery Quintessential · 極氣: patterned jasper cubes with one silver-tone accent, designed in Hong Kong.";

function product() {
  const match = products.find((entry) => entry.slug === SLUG);
  if (!match) throw new Error(`missing ${SLUG}`);
  return match;
}

function catalogText(entry: ReturnType<typeof product>) {
  return [
    entry.name,
    entry.description,
    entry.metaDescription ?? "",
    entry.imageAlt ?? "",
    entry.stone,
    entry.tags.join(" "),
    entry.features.join(" "),
    ...Object.entries(entry.specs).flatMap(([key, value]) => [key, value]),
    ...(entry.variants ?? []).flatMap((variant) => [
      variant.size ?? "",
      variant.material ?? "",
    ]),
  ].join("\n");
}

describe("red leopard skin jasper cube bracelet images", () => {
  it("uses only red-leopard-jasper-bracelet.webp for the image list, hover, and gallery", () => {
    const entry = product();
    const gallery = [...entry.images, entry.hoverImage].filter(
      (src): src is string => Boolean(src)
    );

    expect(entry.images).toEqual([ONLY_IMAGE]);
    expect(entry.hoverImage).toBe(ONLY_IMAGE);
    expect(gallery.length).toBeGreaterThan(0);
    expect(gallery.every((src) => src === ONLY_IMAGE)).toBe(true);
    expect(gallery.every((src) => src.endsWith(".webp"))).toBe(true);
  });

  it("does not share an image path with any other product", () => {
    const entry = product();
    const own = new Set(
      [...entry.images, entry.hoverImage].filter((src): src is string => Boolean(src))
    );
    const others = products
      .filter((item) => item.slug !== entry.slug)
      .flatMap((item) => [...item.images, item.hoverImage].filter((src): src is string => Boolean(src)));

    expect([...own]).toEqual([ONLY_IMAGE]);
    expect(others.some((src) => own.has(src))).toBe(false);
    expect(entry.images.join(" ")).not.toContain("pearl-silver-necklace-v-2.jpg");
    expect(entry.images.join(" ")).not.toContain("red-leopard-skin-jasper-bracelet-hover.jpg");
    expect(entry.hoverImage).not.toContain("red-leopard-skin-jasper-bracelet-hover.jpg");
    expect(galleryHasPng(entry)).toBe(false);
  });
});

function galleryHasPng(entry: ReturnType<typeof product>) {
  return [...entry.images, entry.hoverImage ?? ""].some((src) => src.endsWith(".png"));
}

describe("red leopard skin jasper cube bracelet copy", () => {
  it("matches the name, stone, bead shape, and accent exactly", () => {
    const entry = product();

    expect(entry.id).toBe("red-leopard-jasper-iii");
    expect(entry.name).toBe(NAME);
    expect(entry.slug).toBe(SLUG);
    expect(entry.stone).toBe(STONE);
    expect(entry.specs.Stone).toBe(STONE);
    expect(entry.specs["Bead Shape"]).toBe(BEAD_SHAPE);
    expect(entry.specs.Accent).toBe(ACCENT);
    expect(entry.specs.Spacers).toBe("Small dark spacers");
    expect(entry.specs.Care).toBe("Keep dry. Store separately. Wipe with a soft cloth.");
    expect(entry.description).toBe(DESCRIPTION);
    expect(entry.imageAlt).toBe(IMAGE_ALT);
    expect(entry.metaDescription).toBe(META_DESCRIPTION);
    expect(entry.features).toEqual([
      "Tailored for your preferred fit",
      "Natural gemstones selected for color and character",
      "Complimentary first resize for new customers",
    ]);
    expect(entry.variants?.map((variant) => variant.size)).toEqual(["Small", "Medium", "Large"]);
    expect(entry.variants?.map((variant) => variant.material)).toEqual([
      "Silver-tone",
      "Silver-tone",
      "Silver-tone",
    ]);
    expect(entry.variants?.map((variant) => variant.sku)).toEqual([
      "JQJ-RLSJ-III-S-SS",
      "JQJ-RLSJ-III-M-SS",
      "JQJ-RLSJ-III-L-SS",
    ]);
    expect(entry.price).toBe(599.99);
    expect(entry.compareAtPrice).toBe(699.99);
    expect(entry.tags).toEqual(["sale"]);
    expect(entry.rating).toBeUndefined();
    expect(entry.reviewCount).toBeUndefined();
    expect(entry.specs["Bead Size"]).toBeUndefined();
    expect(entry.specs.Clasp).toBeUndefined();
    expect(entry.specs.Color).toBeUndefined();
    expect(entry.specs.Origin).toBeUndefined();
  });

  it("has no logo, 6mm, Round, Sterling, clasp, rating, top-rated, or craft wording", () => {
    const entry = product();
    const text = catalogText(entry);

    expect(text).not.toMatch(/logo/i);
    expect(text).not.toContain("6mm");
    expect(text).not.toMatch(/\bRound\b/);
    expect(text).not.toMatch(/\bround\b/i);
    expect(text).not.toContain("Sterling");
    expect(text).not.toMatch(/clasp/i);
    expect(text).not.toMatch(/\b\d+(?:\.\d+)?\s*(?:cm|mm)\b/i);
    expect(text).not.toMatch(/handmade|hand-made|hand-finished|handcrafted|atelier/i);
    expect(entry.tags).not.toContain("top-rated");
    expect(entry.rating).toBeUndefined();
    expect(entry.reviewCount).toBeUndefined();
    expect("rating" in entry).toBe(false);
    expect("reviewCount" in entry).toBe(false);
  });

  it("is findable as Red Leopard Skin Jasper in the stone list, collection filter, and search", () => {
    const entry = product();
    const listed = products.filter((item) => item.stone === STONE);
    const haystack =
      `${entry.name} ${entry.description} ${entry.stone} ${entry.tags.join(" ")} ${Object.values(entry.specs).join(" ")}`.toLowerCase();

    expect(stones).toContain(STONE);
    expect(stones).not.toContain("Carnelian");
    expect(entry.stone).not.toBe("Carnelian");
    expect(listed.map((item) => item.slug)).toEqual([SLUG]);
    expect(haystack.includes(STONE.toLowerCase())).toBe(true);
  });
});
