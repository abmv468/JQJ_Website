import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { products } from "@/data/products";
import { HERO_IMAGE_PATH, MEGA_MENU_CARD_IMAGES } from "@/lib/site-images";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const publicDir = path.join(root, "public");

// Every entry needs a reason.
export const SHARED_IMAGE_ALLOWLIST: readonly string[] = [];

type Role = "image" | "hover";

type ImageUse = {
  slug: string;
  role: Role;
  webPath: string;
};

function shortSha(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 8);
}

function fileName(webPath: string): string {
  return webPath.split("/").pop() ?? webPath;
}

function publicFile(webPath: string): string {
  return path.join(publicDir, webPath.replace(/^\//, ""));
}

function formatUses(uses: ImageUse[]): string {
  return uses.map((use) => `${use.slug} (${use.role})`).join(", ");
}

function reservedWebPaths(): string[] {
  const productDir = path.join(publicDir, "products");
  const hoverCards = readdirSync(productDir)
    .filter((name) => name.startsWith("main-hover-card-") && name.endsWith(".jpg"))
    .map((name) => `/products/${name}`);

  return Array.from(
    new Set([HERO_IMAGE_PATH, ...Object.values(MEGA_MENU_CARD_IMAGES), ...hoverCards])
  );
}

function collectUses(): ImageUse[] {
  return products.flatMap((product) => {
    const uses: ImageUse[] = product.images.map((webPath) => ({
      slug: product.slug,
      role: "image",
      webPath,
    }));
    if (product.hoverImage) {
      uses.push({ slug: product.slug, role: "hover", webPath: product.hoverImage });
    }
    return uses;
  });
}

describe("product images are unique and not reserved site assets", () => {
  it("resolves every catalog image, refuses shared paths and hashes, and keeps hero and mega-menu cards reserved", () => {
    const failures: string[] = [];
    const uses = collectUses();
    const hashes = new Map<string, string>();

    for (const use of uses) {
      const file = publicFile(use.webPath);
      if (!existsSync(file)) {
        failures.push(`missing public file ${use.webPath}; ${use.slug} (${use.role})`);
        continue;
      }
      if (!hashes.has(use.webPath)) hashes.set(use.webPath, shortSha(readFileSync(file)));
    }

    const allowed = new Set(SHARED_IMAGE_ALLOWLIST);
    const byPath = new Map<string, ImageUse[]>();
    for (const use of uses) {
      if (allowed.has(use.webPath)) continue;
      const group = byPath.get(use.webPath) ?? [];
      group.push(use);
      byPath.set(use.webPath, group);
    }
    for (const [webPath, group] of byPath) {
      const slugs = new Set(group.map((use) => use.slug));
      if (slugs.size < 2) continue;
      const sha = hashes.get(webPath) ?? "--------";
      failures.push(`${fileName(webPath)} sha ${sha} shared by ${formatUses(group)}`);
    }

    const byHash = new Map<string, ImageUse[]>();
    for (const use of uses) {
      if (allowed.has(use.webPath)) continue;
      const sha = hashes.get(use.webPath);
      if (!sha) continue;
      const group = byHash.get(sha) ?? [];
      group.push(use);
      byHash.set(sha, group);
    }
    for (const [sha, group] of byHash) {
      const slugs = new Set(group.map((use) => use.slug));
      const files = new Set(group.map((use) => use.webPath));
      if (slugs.size < 2 || files.size < 2) continue;
      const listed = Array.from(files)
        .map((webPath) => {
          const owners = group.filter((use) => use.webPath === webPath);
          return `${fileName(webPath)} sha ${sha}: ${formatUses(owners)}`;
        })
        .join("; ");
      failures.push(listed);
    }

    const reservedHashes = new Map<string, string>();
    for (const webPath of reservedWebPaths()) {
      const file = publicFile(webPath);
      if (!existsSync(file)) {
        failures.push(`missing reserved file ${webPath}`);
        continue;
      }
      reservedHashes.set(webPath, shortSha(readFileSync(file)));
    }

    for (const [webPath, group] of byPath) {
      const sha = hashes.get(webPath);
      if (!sha) continue;
      for (const [reservedPath, reservedSha] of reservedHashes) {
        if (webPath !== reservedPath && sha !== reservedSha) continue;
        failures.push(
          `${fileName(webPath)} sha ${sha} matches reserved ${fileName(reservedPath)}; ${formatUses(group)}`
        );
      }
    }

    expect(failures, failures.join("\n")).toEqual([]);
  });
});
