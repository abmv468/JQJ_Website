import { describe, expect, it } from "vitest";
import ProductPage, { generateMetadata } from "@/app/(store)/products/[slug]/page";
import { productPageMetadata } from "@/lib/product-page-metadata";
import {
  getProductBySlug,
  paymentTestListingHidden,
  products,
  unlistedProducts,
} from "@/data/products";
import type { Metadata } from "next";

const PAYMENT_TEST_SLUG = "payment-test-do-not-ship";

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
  it("does not serve the payment-test listing while it is hidden", () => {
    expect(paymentTestListingHidden).toBe(true);
    expect(unlistedProducts.some((product) => product.slug === PAYMENT_TEST_SLUG)).toBe(true);
    expect(getProductBySlug(PAYMENT_TEST_SLUG)).toBeUndefined();

    const metadata = generateMetadata({ params: { slug: PAYMENT_TEST_SLUG } });
    const listing = unlistedProducts.find((product) => product.slug === PAYMENT_TEST_SLUG);
    expect(metadata.title).not.toBe(listing?.name);
    expect(metadata.openGraph).toBeUndefined();
    expect(metadata.twitter).toBeUndefined();

    expect(() => ProductPage({ params: { slug: PAYMENT_TEST_SLUG } })).toThrow(
      expect.objectContaining({ digest: "NEXT_NOT_FOUND" }),
    );
  });

  it("emits noindex, nofollow for unlisted pages when the hide flag is off", () => {
    expect(unlistedProducts.length).toBeGreaterThan(0);

    for (const product of unlistedProducts) {
      expect(
        getProductBySlug(product.slug, { paymentTestListingHidden: false })?.slug,
      ).toBe(product.slug);

      const metadata = productPageMetadata(product.slug, {
        paymentTestListingHidden: false,
      });
      expect(metadata.title).toBe(product.name);
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
