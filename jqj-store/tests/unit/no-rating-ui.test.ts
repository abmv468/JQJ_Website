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

function renderProduct(node: ReactNode) {
  return renderToStaticMarkup(
    createElement(CurrencyProvider, null, createElement(CartProvider, null, node))
  );
}

function expectNoRatingUi(html: string) {
  expect(html).not.toMatch(/★|☆/);
  expect(html).not.toMatch(/aria-label="[^"]*rating/i);
  expect(html).not.toMatch(/\breviews?\b/i);
  expect(html).not.toMatch(/reviewCount|StarRating/i);
}

describe("catalog product cards and detail hide ratings", () => {
  const product = products[0];

  it("renders ProductCard without stars or review text", () => {
    expectNoRatingUi(renderProduct(createElement(ProductCard, { product })));
  });

  it("renders ProductDetail without stars or review text", () => {
    expectNoRatingUi(
      renderProduct(createElement(ProductDetail, { product, related: [] }))
    );
  });
});
