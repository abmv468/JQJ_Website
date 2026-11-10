import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ProductPlaceholder from "@/components/ui/ProductPlaceholder";

vi.mock("next/image", () => ({
  default: () => null,
}));

const storeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const selfFile = path.resolve(fileURLToPath(import.meta.url));

const bannedFileNames = [
  "amethyst-bracelet.webp",
  "sodalite-bracelet.webp",
  "red-leopard-jasper-bracelet.webp",
  "silver-bracelet.webp",
  "labradorite-bracelet.webp",
  "brown-tourmaline-bracelet.webp",
  "pearl-silver-necklace.webp",
  "blue-lace-agate-pendant.webp",
  "labradorite-pendant.webp",
  "lifestyle.webp",
];

const scanRoots = ["app", "components", "lib", "data", "public"];
const skippedDirs = new Set(["node_modules", ".next"]);

function collectFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skippedDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (path.resolve(full) === selfFile) continue;
    if (entry.isDirectory()) {
      files.push(...collectFiles(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

describe("unlicensed studio images", () => {
  it("keeps the banned file names and aurum out of the storefront tree", () => {
    const hits: string[] = [];

    for (const root of scanRoots) {
      for (const file of collectFiles(path.join(storeRoot, root))) {
        const relative = path.relative(storeRoot, file);
        const segments = relative.split(path.sep).map((segment) => segment.toLowerCase());
        const text = fs.readFileSync(file).toString("latin1").toLowerCase();

        for (const name of bannedFileNames) {
          const needle = name.toLowerCase();
          if (segments.includes(needle)) hits.push(`${relative} (filename)`);
          if (text.includes(needle)) hits.push(`${relative} (contents: ${name})`);
        }

        if (text.includes("aurum")) hits.push(`${relative} (contents: aurum)`);
      }
    }

    expect(hits).toEqual([]);
  });

  it("renders the product name on the placeholder", () => {
    const html = renderToStaticMarkup(
      createElement(ProductPlaceholder, { name: "Amethyst Bracelet XV (5mm)" })
    );

    expect(html).toContain("Amethyst Bracelet XV (5mm)");
    expect(html).not.toContain("<img");
  });

  it("keeps the hero source free of the rating pill", () => {
    const source = fs.readFileSync(path.join(storeRoot, "components/home/Hero.tsx"), "utf8");

    expect(source).not.toMatch(/reviews/i);
    expect(source).not.toMatch(/\d(\.\d)?\s*\/\s*5/);
    expect(source).toContain("Natural Stones. Cultured Design.");
  });
});
