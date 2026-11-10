import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SUPPORT_EMAIL } from "@/lib/brand";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function sourceFiles(dir: string): string[] {
  const absolute = path.join(root, dir);
  const files: string[] = [];
  for (const entry of readdirSync(absolute)) {
    const full = path.join(absolute, entry);
    if (statSync(full).isDirectory()) {
      files.push(...sourceFiles(path.join(dir, entry)));
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

describe("support email", () => {
  it("is the confirmed customer address", () => {
    expect(SUPPORT_EMAIL).toBe("support@jqdgroup.com");
  });

  it("keeps every customer-facing address in app and components on SUPPORT_EMAIL", () => {
    const hits: string[] = [];
    for (const file of [...sourceFiles("app"), ...sourceFiles("components")]) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(emailPattern)) {
        hits.push(`${path.relative(root, file)}: ${match[0]}`);
      }
      if (text.includes("mailto:")) {
        expect(text).toContain("SUPPORT_EMAIL");
      }
    }
    expect(hits).toEqual([]);
  });
});
