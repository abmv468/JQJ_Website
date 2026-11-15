import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { metadata as notFoundMetadata } from "@/app/not-found";
import { metadata as journalMetadata } from "@/app/(store)/journal/page";
import { paymentTestListingHidden } from "@/data/products";

describe("technical SEO preview", () => {
  it("disallows private routes and the payment-test listing", () => {
    const rules = robots().rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    const disallow = rule?.disallow;
    const paths = Array.isArray(disallow) ? disallow : [disallow];
    expect(paths).toEqual(
      expect.arrayContaining([
        "/api",
        "/cart",
        "/checkout",
        "/auth",
        "/account",
        "/admin",
        "/products/payment-test-do-not-ship",
      ]),
    );
    expect(paymentTestListingHidden).toBe(true);
  });

  it("uses a real per-URL lastmod and leaves journal out of the sitemap", () => {
    const entries = sitemap();
    const stamps = entries.map((entry) => new Date(entry.lastModified ?? 0).toISOString());
    expect(new Set(stamps).size).toBeGreaterThan(1);
    expect(entries.every((entry) => entry.lastModified instanceof Date)).toBe(true);
    expect(entries.some((entry) => entry.url.endsWith("/journal"))).toBe(false);
    expect(entries.some((entry) => entry.url.includes("/journal/"))).toBe(false);
    expect(entries.some((entry) => entry.url.includes("payment-test"))).toBe(false);
    const shipping = entries.find((entry) => entry.url.endsWith("/shipping"));
    const privacy = entries.find((entry) => entry.url.endsWith("/privacy"));
    const home = entries.find((entry) => entry.url.endsWith("/") || entry.url.endsWith(".app/"));
    expect(shipping?.lastModified).not.toEqual(privacy?.lastModified);
    expect(home?.lastModified).not.toEqual(privacy?.lastModified);
  });

  it("noindexes journal until a later go-live", () => {
    expect(journalMetadata.robots).toMatchObject({
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    });
  });

  it("does not tell googlebot to index a 404 or canonicalize it to the homepage", () => {
    expect(notFoundMetadata.robots).toMatchObject({
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    });
    expect(notFoundMetadata.alternates).toEqual({ canonical: null });
  });
});
