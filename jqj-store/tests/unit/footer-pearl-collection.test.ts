import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LIFESTYLE_CAPTION_BODY } from "@/components/home/ForgetMassProduced";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const FOOTER_LINE = "Natural stone pieces designed for everyday ritual.";
const OLD_FOOTER_LINE = "Hand-finished natural stone pieces designed for everyday ritual.";
const ANNOUNCEMENT_LINES = [
  "Free worldwide shipping on orders over",
  "Handcrafted with premium natural gemstones",
  "Free resizing for new customers",
] as const;
const HERO_SINCE = "Museum-inspired since 2015";
const HERO_EYEBROW = "Designed in Hong Kong · Natural stones";
const HERO_SENTENCE =
  "Bracelets and necklaces shaped by Eastern heritage, museum-inspired restraint, and the quiet character of natural gemstones.";
const HERO_ALT = "Model wearing a red bead bracelet by Jewellery Quintessential";
const LIFESTYLE_HEADLINE = "Beyond mass production, closer to ritual.";
const LIFESTYLE_BODY =
  "From our design studio to materials sourced around the world, every piece is shaped by considered proportions, distinctive stones, and the details that make it yours.";
const LIFESTYLE_ALT = "Black beaded necklace with gold-tone spacers on a black background";
const CAPTION_BODY = "Each piece is designed to feel collected rather than mass-made.";

function source(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function renderedText(fragment: string): string {
  return fragment.replace(/\s+/g, " ").trim();
}

describe("WEB-026 footer and Pearl Collection wording", () => {
  it("pins the footer ritual line without the hand-finished prefix", () => {
    const footer = source("components/layout/Footer.tsx");
    expect(footer).toContain(FOOTER_LINE);
    expect(footer).not.toContain(OLD_FOOTER_LINE);
    expect(footer.match(/everyday ritual\./g)).toHaveLength(1);
  });

  it("names the collection card Pearl Collection", () => {
    const collections = source("components/home/LatestCollections.tsx");
    expect(collections).toContain('{ name: "Pearl Collection", image: products[8].images[0], href: "/necklaces", alt: "Pearl and silver necklace" }');
    expect(collections).not.toContain("Pearl Atelier");
    expect(collections).not.toContain("Pearl Collective");
  });

  it("leaves the announcement bar copy unchanged", () => {
    const announcement = source("components/layout/AnnouncementBar.tsx");
    for (const line of ANNOUNCEMENT_LINES) {
      expect(announcement).toContain(line);
    }
  });

  it("keeps the hand-finished silver clasp product description", () => {
    const products = source("data/products.ts");
    expect(products).toContain("hand-finished silver clasp");
  });

  it("keeps the WEB-025 Hero and lifestyle strings", () => {
    const hero = source("components/home/Hero.tsx");
    const lifestyle = source("components/home/ForgetMassProduced.tsx");

    expect(hero).toContain(`"${HERO_SINCE}"`);
    expect(hero).toContain(HERO_EYEBROW);
    const paragraph = hero.match(/text-white\/74[\s\S]*?>\s*([\s\S]*?)<\/p>/);
    expect(paragraph).not.toBeNull();
    expect(renderedText(paragraph?.[1] ?? "")).toBe(HERO_SENTENCE);
    expect(hero).toContain(`alt="${HERO_ALT}"`);
    expect(hero).toMatch(/import\s*\{\s*RETURNS_DAYS\s*\}\s*from\s*"@\/lib\/policy"/);
    expect(hero).toContain("`${RETURNS_DAYS}-day returns`");

    expect(lifestyle).toContain(LIFESTYLE_HEADLINE);
    expect(lifestyle).toContain(LIFESTYLE_BODY);
    expect(lifestyle).toContain(`alt="${LIFESTYLE_ALT}"`);
    expect(lifestyle).toContain(`export const LIFESTYLE_CAPTION_BODY =\n  "${CAPTION_BODY}";`);
    expect(LIFESTYLE_CAPTION_BODY).toBe(CAPTION_BODY);
  });
});
