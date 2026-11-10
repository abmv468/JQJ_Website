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
import { products } from "@/data/products";

vi.mock("next/image", () => ({
  default: (props: { alt?: string }) => createElement("img", { alt: props.alt ?? "" }),
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children?: ReactNode }) => createElement("a", null, children),
}));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SURFACES = ["components/product/ProductCard.tsx", "components/product/ProductDetail.tsx"];

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
  expect(html).not.toMatch(/\breviews?\b/i);
}

describe("catalog product cards and detail hide ratings", () => {
  const product = products[0];

  it("renders ProductCard without a star icon or rating label", () => {
    expectNoRatingUi(renderProduct(createElement(ProductCard, { product })), SURFACES[0]);
  });

  it("renders ProductDetail without a star icon or rating label", () => {
    expectNoRatingUi(
      renderProduct(createElement(ProductDetail, { product, related: [] })),
      SURFACES[1]
    );
  });
});
