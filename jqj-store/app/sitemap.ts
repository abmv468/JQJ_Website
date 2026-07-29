import type { MetadataRoute } from "next";
import { products } from "@/data/products";
import { absoluteUrl } from "@/lib/seo";

const publicPaths = [
  "/",
  "/new",
  "/bracelets",
  "/necklaces",
  "/story",
  "/measure",
  "/care",
  "/faqs",
  "/contact",
  "/shipping",
  "/returns",
  "/repair",
  "/privacy",
  "/terms",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    ...publicPaths.map((path): MetadataRoute.Sitemap[number] => ({
      url: absoluteUrl(path),
      lastModified,
      changeFrequency: path === "/" ? "weekly" : "monthly",
      priority: path === "/" ? 1 : path === "/bracelets" || path === "/necklaces" ? 0.9 : 0.6,
    })),
    ...products.map((product): MetadataRoute.Sitemap[number] => ({
      url: absoluteUrl(`/products/${product.slug}`),
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    })),
  ];
}