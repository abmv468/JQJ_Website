import type { Metadata } from "next";
import { getProductBySlug, unlistedProducts } from "@/data/products";
import {
  NOT_FOUND_DESCRIPTION,
  NOT_FOUND_TITLE,
  pageSocial,
} from "@/lib/page-social";

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

const unresolvedProductMetadata: Metadata = {
  title: { absolute: NOT_FOUND_TITLE },
  // Same as app/not-found.tsx: do not add a second robots tag. The 404
  // response already carries one noindex, nofollow meta.
  robots: null,
  // An unresolved slug must not canonicalize to /products/{slug} or the homepage.
  alternates: { canonical: null },
  ...pageSocial({
    title: NOT_FOUND_TITLE,
    description: NOT_FOUND_DESCRIPTION,
    unresolved: true,
  }),
};

export function productPageMetadata(
  slug: string,
  visibility?: { paymentTestListingHidden?: boolean },
): Metadata {
  const product = getProductBySlug(slug, visibility);
  if (!product) return unresolvedProductMetadata;

  const productPath = `/products/${slug}`;
  const unlisted = unlistedProducts.some((item) => item.slug === slug);

  return {
    title: product.name,
    description: product.description,
    alternates: { canonical: productPath },
    // Omit the key for catalog products. An explicit `undefined` replaces the
    // root layout robots and drops their index, follow tags.
    ...(unlisted ? { robots: unlistedProductRobots } : {}),
    openGraph: {
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
    },
    twitter: {
      card: "summary_large_image",
      title: product.name,
      description: product.description,
      images: [product.images[0]],
    },
  };
}
