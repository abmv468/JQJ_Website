import type { MetadataRoute } from "next";
import { unlistedProducts } from "@/data/products";
import { absoluteUrl } from "@/lib/seo";

const paymentTest = unlistedProducts.find(
  (product) => product.slug === "payment-test-do-not-ship",
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
        paymentTest ? `/products/${paymentTest.slug}` : "/products/payment-test-do-not-ship",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
