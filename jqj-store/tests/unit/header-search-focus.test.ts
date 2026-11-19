import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function source(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

describe("header search focus ring", () => {
  const css = source("app/globals.css");
  const header = source("components/layout/Header.tsx");

  it("keeps the global champagne focus outline", () => {
    expect(css)
      .toContain(`:where(a, button, input, textarea, select):focus-visible {
  outline: 2px solid #e1c19d;
  outline-offset: 3px;
}`);
  });

  it("draws that ring around the header search form", () => {
    expect(header).toContain('id="header-search-form"');
    expect(header).toContain('id="header-search-input"');
    expect(css).toContain(`#header-search-form:has(:focus-visible) {
  outline: 2px solid #e1c19d;
  outline-offset: 3px;
}`);
    expect(css)
      .toContain(`#header-search-form :where(input, button):focus-visible {
  outline: none;
  outline-offset: 0;
}`);
  });

  it("only contains the one header search form", () => {
    expect(header.match(/id="header-search-form"/g)).toHaveLength(1);
    expect(header.match(/id="header-search-input"/g)).toHaveLength(1);
    expect(header.match(/<m\.form\b/g)).toHaveLength(1);
  });
});
