import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LIFESTYLE_CAPTION_BODY } from "@/components/home/ForgetMassProduced";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const SECTION_LABEL = "Designed in Hong Kong";
const HEADLINE = "Beyond mass production, closer to ritual.";
const BODY =
  "From our design studio to materials sourced around the world, every piece is shaped by considered proportions, distinctive stones, and the details that make it yours.";
const POINTS = [
  ["Heritage", "Established 2015"],
  ["Designed to belong", "Designed with meaning"],
  ["Material character", "Natural stones, individually selected"],
] as const;
const CAPTION_TITLE = "Collected pieces";
const HERO_ALT = "Model wearing a red bead bracelet by Jewellery Quintessential";
const HERO_SINCE = "Museum-inspired since 2015";
const CAPTION_BODY = "Each piece is designed to feel collected rather than mass-made.";
const HERO_EYEBROW = "Designed in Hong Kong · Natural stones";
const HERO_SENTENCE =
  "Bracelets and necklaces shaped by Eastern heritage, museum-inspired restraint, and the quiet character of natural gemstones.";
const LIFESTYLE_ALT = "Black beaded necklace with gold-tone spacers on a black background";

const BANNED =
  /handmade|hand-finished|handfinished|atelier|china|handcrafted|artisanal|artisan|craftsmanship|crafted/i;

function source(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function renderedText(fragment: string): string {
  return fragment.replace(/\s+/g, " ").trim();
}

describe("lifestyle section copy", () => {
  const lifestyle = source("components/home/ForgetMassProduced.tsx");
  const hero = source("components/home/Hero.tsx");

  it("pins the approved ForgetMassProduced strings", () => {
    expect(LIFESTYLE_CAPTION_BODY).toBe(CAPTION_BODY);
    expect(lifestyle).toContain(`export const LIFESTYLE_CAPTION_BODY =\n  "${CAPTION_BODY}";`);
    expect(lifestyle.match(new RegExp(CAPTION_BODY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))).toHaveLength(1);
    expect(lifestyle).toContain("{LIFESTYLE_CAPTION_BODY}");

    expect(lifestyle).toContain(SECTION_LABEL);
    expect(lifestyle).toContain(HEADLINE);
    expect(lifestyle).toContain(BODY);
    expect(lifestyle).toContain(`>\n              ${CAPTION_TITLE}\n            </p>`);
    expect(lifestyle).not.toContain("Collected pieces.");
    expect(lifestyle).toContain('src="/products/lifestyle.webp"');
    expect(lifestyle).toContain(`alt="${LIFESTYLE_ALT}"`);

    const labelAt = lifestyle.indexOf('["Heritage"');
    expect(lifestyle.slice(labelAt, labelAt + 400)).toContain(POINTS.map(([label, value]) => `["${label}", "${value}"]`).join(",\n                "));
  });

  it("pins the Hero eyebrow, sentence, alt, and guarantees", () => {
    expect(hero).toContain(HERO_EYEBROW);
    expect(hero).toContain("\u00B7");
    const paragraph = hero.match(/text-white\/74[\s\S]*?>\s*([\s\S]*?)<\/p>/);
    expect(paragraph).not.toBeNull();
    expect(renderedText(paragraph?.[1] ?? "")).toBe(HERO_SENTENCE);
    expect(hero).toContain(`alt="${HERO_ALT}"`);
    expect(hero).toMatch(/import\s*\{\s*RETURNS_DAYS\s*\}\s*from\s*"@\/lib\/policy"/);
    expect(hero).toContain("`${RETURNS_DAYS}-day returns`");
    expect(hero).not.toContain("30-day returns");
    expect(hero).toContain(`"${HERO_SINCE}"`);
    expect(hero).not.toContain("Satisfaction Guarantee");
    expect(hero).not.toMatch(/StarRating/);
    expect(hero).not.toMatch(/reviews/i);
    expect(hero).not.toMatch(/\d(\.\d)?\s*\/\s*5/);
    expect(lifestyle).toContain(`alt="${LIFESTYLE_ALT}"`);
    expect(LIFESTYLE_CAPTION_BODY).toBe(CAPTION_BODY);
  });

  it("keeps banned words out of Hero and ForgetMassProduced", () => {
    expect(lifestyle).not.toMatch(BANNED);
    expect(hero).not.toMatch(BANNED);
    expect(LIFESTYLE_CAPTION_BODY).not.toMatch(BANNED);
    expect(HERO_EYEBROW).not.toMatch(BANNED);
    expect(HERO_SENTENCE).not.toMatch(BANNED);
    expect(LIFESTYLE_ALT).not.toMatch(BANNED);
  });
});
