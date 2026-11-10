import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import CheckoutPage from "@/app/(store)/checkout/page";
import { COD_FEE, COD_FREE_LABEL } from "@/lib/checkout-fees";

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useState: (<T,>(initial: T) => {
      if (initial === "airwallex") return actual.useState("cod" as T);
      return actual.useState(initial);
    }) as typeof actual.useState,
  };
});

vi.mock("next/image", () => ({
  default: () => null,
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children?: unknown }) => children ?? null,
}));

vi.mock("@/context/CurrencyContext", () => ({
  useCurrency: () => ({
    currency: "EUR",
    formatFromUsd: (amountUsd: number) => `DISPLAY:EUR:${amountUsd}`,
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
        quantity: 2,
      },
    ],
    subtotal: 200,
    clearCart: () => undefined,
  }),
}));

describe("COD radio label", () => {
  it("shows the no-fee label only, in place of a converted fee, when the display currency is EUR", () => {
    const html = renderToStaticMarkup(createElement(CheckoutPage));

    expect(COD_FEE).toBe(0);
    expect(html).toContain(COD_FREE_LABEL);
    expect(html).not.toContain("Cash on Delivery (+");
    expect(html).not.toContain("Cash on Delivery fee");
    expect(html).not.toContain("DISPLAY:EUR:");
    expect(html).toContain("Credit / Debit Card (Airwallex Hosted Checkout)");
  });
});
