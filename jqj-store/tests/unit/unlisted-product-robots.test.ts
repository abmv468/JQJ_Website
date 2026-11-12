import { describe, expect, it } from "vitest";
import { generateMetadata } from "@/app/(store)/products/[slug]/page";
import { products, unlistedProducts } from "@/data/products";
import type { Metadata } from "next";

function robotsDirectives(metadata: Metadata) {
  const robots = metadata.robots;
  expect(robots).toBeTruthy();
  expect(typeof robots).not.toBe("string");
  if (!robots || typeof robots === "string") {
    throw new Error("expected a robots object");
  }

  const googleBot = robots.googleBot;
  expect(googleBot).toBeTruthy();
  expect(typeof googleBot).not.toBe("string");
  if (!googleBot || typeof googleBot === "string") {
    throw new Error("expected a googleBot object");
  }

  return { robots, googleBot };
}

describe("product page robots", () => {
  it("emits noindex, nofollow for every unlisted product, including googlebot", () => {
    expect(unlistedProducts.length).toBeGreaterThan(0);

    for (const product of unlistedProducts) {
      const metadata = generateMetadata({ params: { slug: product.slug } });
      const { robots, googleBot } = robotsDirectives(metadata);

      expect(robots.index).toBe(false);
      expect(robots.follow).toBe(false);
      expect(googleBot.index).toBe(false);
      expect(googleBot.follow).toBe(false);
    }
  });

  it("leaves public catalog product pages indexable", () => {
    expect(products.length).toBeGreaterThan(0);

    for (const product of products) {
      const metadata = generateMetadata({ params: { slug: product.slug } });
      expect(metadata).not.toHaveProperty("robots");
    }
  });
});
