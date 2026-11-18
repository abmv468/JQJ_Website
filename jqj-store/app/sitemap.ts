import type { MetadataRoute } from "next";
import { JOURNAL_POSTS } from "@/data/journal";
import { products } from "@/data/products";
import { routeLastModified } from "@/lib/sitemap-lastmod";
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
  return [
    ...publicPaths.map((path): MetadataRoute.Sitemap[number] => ({
      url: absoluteUrl(path),
      lastModified: routeLastModified(path),
      changeFrequency: path === "/" ? "weekly" : "monthly",
      priority:
        path === "/"
          ? 1
          : path === "/bracelets" || path === "/necklaces"
            ? 0.9
            : 0.6,
    })),
    {
      url: absoluteUrl("/journal"),
      lastModified: routeLastModified("/journal"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    ...JOURNAL_POSTS.map((post): MetadataRoute.Sitemap[number] => ({
      url: absoluteUrl(`/journal/${post.slug}`),
      lastModified: routeLastModified(`/journal/${post.slug}`),
      changeFrequency: "monthly",
      priority: 0.6,
    })),
    ...products.map((product): MetadataRoute.Sitemap[number] => ({
      url: absoluteUrl(`/products/${product.slug}`),
      lastModified: routeLastModified(`/products/${product.slug}`),
      changeFrequency: "weekly",
      priority: 0.8,
    })),
  ];
}
