import { expect, test } from "@playwright/test";
import { CARD_CURRENCY_NOTICE, COD_FEE } from "../lib/checkout-fees";

const CART_KEY = "JQD-cart";
const codFeeLabel = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(COD_FEE);
const codOptionLabel = `Cash on Delivery (+${codFeeLabel} fee)`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify([
        {
          id: "amethyst-xv",
          slug: "amethyst-bracelet-xv",
          name: "Amethyst Bracelet XV (5mm)",
          price: 330.99,
          image: "/products/amethyst-bracelet-xv-1.jpg",
          quantity: 1,
        },
      ])
    );
  }, CART_KEY);
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (
      url.includes("supabase.co") ||
      url.includes("127.0.0.1:54399") ||
      url.includes("airwallex.com")
    ) {
      return route.abort();
    }
    return route.continue();
  });
  await page.route(/\/api\/products\/availability$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ errors: [] }),
    })
  );
});

test("checkout copy omits sandbox wording and shows the shared COD fee", async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/checkout");
    await expect(page.getByRole("button", { name: "Continue to Secure Payment" })).toBeVisible();
    await expect(page.getByText(codOptionLabel)).toBeVisible();
    await expect(page.getByText(CARD_CURRENCY_NOTICE)).toBeVisible();
    expect((await page.locator("body").innerText()).toLowerCase()).not.toContain("sandbox");

    await page.getByText(codOptionLabel).click();
    await expect(page.getByRole("button", { name: "Place Order" })).toBeVisible();
    await expect(page.getByText(codOptionLabel)).toBeVisible();
    await expect(page.getByText(CARD_CURRENCY_NOTICE)).toBeVisible();
    await expect(page.getByText("Cash on Delivery fee")).toBeVisible();
    expect((await page.locator("body").innerText()).toLowerCase()).not.toContain("sandbox");
  }
});
