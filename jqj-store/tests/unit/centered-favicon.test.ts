import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { paymentTestListingHidden } from "@/data/products";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Locked WEB-023 centered monogram bytes. Do not recrop or substitute an earlier icon. */
const LOCKED_ICONS: Record<string, string> = {
  "public/favicon.ico": "197770e4faa563578c9ede62524f3c49fcc680d2023bd011d6ec7f01beb28248",
  "public/icon-16.png": "581e43fa98aa49fb4feb8229ab734ed7c1a1c8a72369b736c6a045d29471dbf7",
  "public/icon-32.png": "3b6368f0e4386ce95a3657d6d7d0a7e9abef974f77fd77a89a1c4004524a7e24",
  "public/icon-48.png": "7aae4e18c8c9313caa696312bebe1421253478e34ee88e3bb1f3301000a72a44",
  "public/apple-touch-icon.png": "9b5c3dc8059503b831c9c7a999dff7e1b9f9d9b7b6b8a6fe618fbc5a417af9f4",
  "public/icon-192.png": "d2229b639284072a102259c503b281e92e07900df79e50305bf9100b552451ab",
  "public/icon-512.png": "b1b113763dbb982f0db7b74d1c1371bd0d6068f5185de9910f7d1d6e7a975076",
};

function source(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

function sha256(relative: string): string {
  return createHash("sha256").update(readFileSync(path.join(root, relative))).digest("hex");
}

describe("centered monogram document icon", () => {
  const layout = source("app/layout.tsx");
  const header = source("components/layout/Header.tsx");

  it("commits the locked favicon bytes", () => {
    expect(sha256("public/favicon.ico")).toBe(LOCKED_ICONS["public/favicon.ico"]);
    expect(readFileSync(path.join(root, "public/favicon.ico")).length).toBe(8352);

    for (const [relative, hash] of Object.entries(LOCKED_ICONS)) {
      expect(sha256(relative)).toBe(hash);
    }
  });

  it("wires the ico, apple-touch 180, and 192/512 icons instead of the gem wreath", () => {
    expect(layout).not.toContain("/JQD-logo.png");
    expect(layout).not.toContain("icons: { icon:");
    expect(layout).toContain('url: "/favicon.ico"');
    expect(layout).toContain('sizes: "16x16 32x32 48x48"');
    expect(layout).toContain('url: "/apple-touch-icon.png"');
    expect(layout).toContain('sizes: "180x180"');
    expect(layout).toContain('url: "/icon-192.png"');
    expect(layout).toContain('sizes: "192x192"');
    expect(layout).toContain('url: "/icon-512.png"');
    expect(layout).toContain('sizes: "512x512"');
    expect(layout).toContain('logo: absoluteUrl("/icon-512.png")');
  });

  it("keeps titles, the JQD Group site name, and the hero social images", () => {
    expect(layout).toContain('default: "JQD Group | Natural Stone Jewelry with Cultural Craft"');
    expect(layout).toContain('template: "%s | JQD Group"');
    expect(layout).toContain(
      "Handcrafted bracelets and necklaces inspired by Eastern cultural heritage, museum collaborations, and natural gemstone artistry.",
    );
    expect(layout).toContain('siteName: "JQD Group"');
    expect(layout).toContain('title: "JQD Group | Natural Stone Jewelry with Cultural Craft"');
    expect(layout).toContain('url: "/products/hero-image.jpg"');
    expect(layout).toContain('alt: "JQD Group natural stone jewelry"');
    expect(layout).toContain('images: ["/products/hero-image.jpg"]');
    expect(layout).toContain('name: "JQD Group"');
    expect(layout.match(/name: "JQD Group"/g)).toHaveLength(2);
  });

  it("leaves the gem-wreath file, header mark, and hidden payment-test listing in place", () => {
    expect(existsSync(path.join(root, "public/JQD-logo.png"))).toBe(true);
    expect(header).toContain('src="/header/monogram-jq.png"');
    expect(header).not.toContain("favicon.ico");
    expect(header).not.toContain("icon-512.png");
    expect(paymentTestListingHidden).toBe(true);
  });
});
