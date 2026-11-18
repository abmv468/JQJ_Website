import type { MetadataRoute } from "next";
import { PAYMENT_TEST_SLUG, unlistedProducts } from "@/data/products";
import { absoluteUrl } from "@/lib/seo";

const paymentTest = unlistedProducts.find(
  (product) => product.slug === PAYMENT_TEST_SLUG,
);

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api",
        "/cart",
        "/checkout",
        "/auth",
        "/account",
        "/admin",
        paymentTest
          ? `/products/${paymentTest.slug}`
          : `/products/${PAYMENT_TEST_SLUG}`,
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
