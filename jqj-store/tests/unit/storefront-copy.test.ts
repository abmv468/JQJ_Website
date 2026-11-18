import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const ROOTS = [
  "app/(store)",
  "app/(auth)",
  "app/layout.tsx",
  "app/not-found.tsx",
  "components",
  "data/products.ts",
  "data/journal.ts",
  "lib/product-page-metadata.ts",
  "lib/product-specs.ts",
];

const BANNED: Array<[RegExp, string]> = [
  [/\bhandmade\b/i, "handmade"],
  [/\bhand-finished\b/i, "hand-finished"],
  [/\bhandfinished\b/i, "handfinished"],
  [/\batelier\b/i, "atelier"],
  [/\bhand-crafted\b/i, "hand-crafted"],
  [/\bhandcrafted\b/i, "handcrafted"],
  [/\bcrafted\b/i, "crafted"],
  [/\bartisanal\b/i, "artisanal"],
  [/\bartisan\b/i, "artisan"],
  [/\bjewelry\b/i, "Jewelry"],
];

function filesUnder(relative: string): string[] {
  const absolute = path.join(root, relative);
  if (!statSync(absolute).isDirectory()) return [relative];
  const found: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(next));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
      found.push(next);
  }
  return found;
}

/** Drop class and media strings so CSS utilities such as border-color are not prose. */
function prose(source: string): string {
  return source
    .replace(/className=(?:"[^"]*"|'[^']*'|\{`[^`]*`\}|\{[^}]*\})/g, "")
    .replace(/media:\s*"[^"]*"/g, "");
}

describe("storefront copy lock", () => {
  const files = ROOTS.flatMap(filesUnder);

  it("covers the customer-facing routes this pass touches", () => {
    expect(files).toContain("app/(store)/bracelets/page.tsx");
    expect(files).toContain("app/(store)/cart/page.tsx");
    expect(files).toContain("data/products.ts");
    expect(files).toContain("components/layout/Footer.tsx");
    expect(files).toContain("app/layout.tsx");
  });

  it("keeps banned craft stems and American jewelry out of customer-facing source", () => {
    const hits: string[] = [];
    for (const relative of files) {
      const text = readFileSync(path.join(root, relative), "utf8");
      for (const [pattern, label] of BANNED) {
        if (pattern.test(text)) hits.push(`${relative}: ${label}`);
      }
      const visible = prose(text);
      if (/(?<![-A-Za-z])colors?(?![-A-Za-z])/i.test(visible)) {
        hits.push(`${relative}: color`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("still allows craftsmanship and the legal footer line", () => {
    const footer = readFileSync(
      path.join(root, "components/layout/Footer.tsx"),
      "utf8",
    );
    expect(footer).toContain("© {new Date().getFullYear()} — JQD Group");
    expect(footer).toContain('title: "Jewellery Quintessential"');
    expect(footer).toContain("How to Care for Your Jewellery");
    expect("craftsmanship").not.toMatch(/\bcrafted\b/i);
  });
});
