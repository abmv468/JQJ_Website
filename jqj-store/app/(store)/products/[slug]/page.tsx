import { notFound } from "next/navigation";
import {
  getProductBySlug,
  getRelatedProducts,
  products,
} from "@/data/products";
import ProductDetail from "@/components/product/ProductDetail";
import type { Metadata } from "next";
import { absoluteUrl, jsonLd } from "@/lib/seo";

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const product = getProductBySlug(params.slug);
  const productPath = `/products/${params.slug}`;

  return {
    title: product?.name ?? "Product",
    description:
      product?.description ??
      "Explore handcrafted natural stone jewelry from JQD Group.",
    alternates: { canonical: productPath },
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

export default function ProductPage({ params }: { params: { slug: string } }) {
  const product = getProductBySlug(params.slug);
  if (!product) notFound();

  const related = getRelatedProducts(product);
  const categoryName = product.category === "bracelets" ? "Bracelets" : "Necklaces";
  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    sku: product.sku,
    image: product.images.map((image) => absoluteUrl(image)),
    category: categoryName,
    brand: {
      "@type": "Brand",
      name: "JQD Group",
    },
    offers: {
      "@type": "Offer",
      url: absoluteUrl(`/products/${product.slug}`),
      priceCurrency: "USD",
      price: product.price.toFixed(2),
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: absoluteUrl(),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: categoryName,
        item: absoluteUrl(`/${product.category}`),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: product.name,
        item: absoluteUrl(`/products/${product.slug}`),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(productSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }}
      />
      <ProductDetail product={product} related={related} />
    </>
  );
}
