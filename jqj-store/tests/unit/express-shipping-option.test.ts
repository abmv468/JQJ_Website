import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import CheckoutPage from "@/app/(store)/checkout/page";

vi.mock("next/image", () => ({
  default: () => null,
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children?: unknown }) => children ?? null,
}));

vi.mock("@/context/CurrencyContext", () => ({
  useCurrency: () => ({
    currency: "USD",
    formatFromUsd: (amountUsd: number) => `USD:${amountUsd}`,
  }),
}));

vi.mock("@/context/CartContext", () => ({
  useCart: () => ({
    items: [
      {
        id: "prod-amethyst",
        slug: "amethyst-bracelet-xv",
        name: "Amethyst Bracelet XV (5mm)",
        price: 100,
        image: "/products/amethyst.jpg",
        quantity: 1,
      },
    ],
    clearCart: () => undefined,
  }),
}));

describe("checkout shipping option", () => {
  it("hides the paid option and defaults to standard before the flag is known", () => {
    const html = renderToStaticMarkup(createElement(CheckoutPage));
    expect(html).toContain("Standard shipping");
    expect(html).not.toContain("Expedited shipping");
    expect(html).not.toMatch(/\bUPS\b|\bExpress\b/);
  });
});
