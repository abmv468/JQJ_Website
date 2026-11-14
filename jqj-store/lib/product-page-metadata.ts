import type { Metadata } from "next";
import { getProductBySlug, unlistedProducts } from "@/data/products";

// Served unlisted PDPs stay reachable by direct URL. Override robots and
// googleBot together so neither meta is left at the root layout's index, follow.
// While `paymentTestListingHidden` is true, that slug does not resolve and the
// product page calls notFound() instead of rendering the listing.
const unlistedProductRobots: Metadata["robots"] = {
  index: false,
  follow: false,
  googleBot: {
    index: false,
    follow: false,
  },
};

export function productPageMetadata(
  slug: string,
  visibility?: { paymentTestListingHidden?: boolean },
): Metadata {
  const product = getProductBySlug(slug, visibility);
  const productPath = `/products/${slug}`;
  const unlisted = unlistedProducts.some((item) => item.slug === slug);

  return {
    title: product?.name ?? "Product",
    description:
      product?.description ??
      "Explore handcrafted natural stone jewelry from JQD Group.",
    alternates: { canonical: productPath },
    // Omit the key for catalog products. An explicit `undefined` replaces the
    // root layout robots and drops their index, follow tags.
    ...(unlisted ? { robots: unlistedProductRobots } : {}),
    openGraph: product
      ? {
          type: "website",
          url: productPath,
          title: product.name,
          description: product.description,
          images: [
            {
              url: product.images[0],
              alt: product.name,
            },
          ],
        }
      : undefined,
    twitter: product
      ? {
          card: "summary_large_image",
          title: product.name,
          description: product.description,
          images: [product.images[0]],
        }
      : undefined,
  };
}
