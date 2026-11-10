import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CartProvider } from "@/context/CartContext";
import { CurrencyProvider } from "@/context/CurrencyContext";
import ProductCard from "@/components/product/ProductCard";
import ProductDetail from "@/components/product/ProductDetail";
import { products, type Product } from "@/data/products";

vi.mock("next/image", () => ({
  default: (props: { alt?: string }) => createElement("img", { alt: props.alt ?? "" }),
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children?: ReactNode }) => createElement("a", null, children),
}));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CARD = "components/product/ProductCard.tsx";
const DETAIL = "components/product/ProductDetail.tsx";

const ratingCases = [
  { rating: null, reviewCount: null },
  { rating: null, review_count: null },
  { rating: undefined, reviewCount: undefined },
  { rating: 0, reviewCount: 0 },
  { rating: 0, review_count: 0 },
] as const;

function renderProduct(node: ReactNode) {
  return renderToStaticMarkup(
    createElement(CurrencyProvider, null, createElement(CartProvider, null, node))
  );
}

function expectNoRatingUi(html: string, sourcePath: string) {
  const source = readFileSync(path.join(root, sourcePath), "utf8");
  expect(source).not.toMatch(/StarRating/);
  expect(source).not.toMatch(/lucide-react[^;]*\bStar\b/);
  expect(html).not.toMatch(/★|☆/);
  expect(html).not.toMatch(/lucide-star\b/);
  expect(html).not.toMatch(/aria-label="[^"]*(rating|out of 5)/i);
  expect(html).not.toMatch(/\d+ reviews?/i);
  expect(html).not.toMatch(/\breviews?\b/i);
  expect(html).not.toMatch(/\bNaN\b|\bundefined\b|\bnull\b/);
}

function withRating(fields: (typeof ratingCases)[number]): Product {
  return { ...products[0], ...fields } as Product;
}

describe("catalog product cards and detail hide ratings", () => {
  const product = products[0];

  it("renders ProductCard without a star icon or rating label", () => {
    expectNoRatingUi(renderProduct(createElement(ProductCard, { product })), CARD);
  });

  it("renders ProductDetail without a star icon or rating label", () => {
    expectNoRatingUi(
      renderProduct(createElement(ProductDetail, { product, related: [] })),
      DETAIL
    );
  });

  for (const fields of ratingCases) {
    const labeled = Object.entries(fields)
      .map(([key, value]) => `${key}:${String(value)}`)
      .join(", ");

    it(`ProductCard has no rating UI when ${labeled}`, () => {
      expectNoRatingUi(
        renderProduct(createElement(ProductCard, { product: withRating(fields) })),
        CARD
      );
    });

    it(`ProductDetail has no rating UI when ${labeled}`, () => {
      expectNoRatingUi(
        renderProduct(
          createElement(ProductDetail, { product: withRating(fields), related: [] })
        ),
        DETAIL
      );
    });
  }

  it("PDP Product JSON-LD source has no aggregateRating", () => {
    const source = readFileSync(
      path.join(root, "app/(store)/products/[slug]/page.tsx"),
      "utf8"
    );
    expect(source).not.toMatch(/aggregateRating|\brating\b|reviewCount|review_count/);
  });
});
