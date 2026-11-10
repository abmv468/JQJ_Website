import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { products } from "@/data/products";

const require = createRequire(import.meta.url);
const configPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../next.config.js"
);

type RemotePattern = {
  protocol?: string;
  hostname: string;
  port?: string;
  pathname?: string;
  search?: string;
};

type NextConfig = {
  images?: {
    domains?: string[];
    remotePatterns?: RemotePattern[];
  };
};

/**
 * Hosts the storefront may pass to next/image. Empty because every Image
 * src in the catalog and components is a root-relative path.
 */
const EXPECTED_REMOTE_PATTERNS: RemotePattern[] = [];

const nextConfig = require(configPath) as NextConfig;

function isLocalPath(src: string): boolean {
  return src.startsWith("/") && !src.startsWith("//");
}

function isAllowlistedRemote(src: string): boolean {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }

  return EXPECTED_REMOTE_PATTERNS.some((pattern) => {
    const protocol = `${pattern.protocol ?? "https"}:`;
    return url.protocol === protocol && url.hostname === pattern.hostname;
  });
}

describe("next/image remote allowlist", () => {
  it("equals the hosts the storefront actually optimizes", () => {
    const patterns = nextConfig.images?.remotePatterns ?? [];
    const domains = nextConfig.images?.domains ?? [];

    expect(patterns).toEqual(EXPECTED_REMOTE_PATTERNS);
    expect(domains).toEqual([]);
    expect(patterns.some((pattern) => pattern.hostname.includes("*"))).toBe(false);
    expect(domains.some((domain) => domain.includes("*"))).toBe(false);
  });

  it("keeps every catalog image local or on that allowlist", () => {
    const srcs = products.flatMap((product) => [
      ...product.images,
      ...(product.hoverImage ? [product.hoverImage] : []),
    ]);

    expect(srcs.length).toBeGreaterThan(0);

    const rejected = srcs.filter((src) => !isLocalPath(src) && !isAllowlistedRemote(src));
    expect(rejected).toEqual([]);
  });
});
