import { expect, test, type Page } from "@playwright/test";
import { CARD_CURRENCY_NOTICE, COD_FEE } from "../lib/checkout-fees";

const CART_KEY = "JQD-cart";
const codOptionLabel = "Cash on Delivery · Free";

async function checkoutTotal(page: Page) {
  return (await page.locator("span.font-heading.text-2xl").innerText()).trim();
}

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

test("checkout copy omits sandbox wording and shows free cash on delivery", async ({ page }) => {
  expect(COD_FEE).toBe(0);

  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/checkout");
    await expect(page.getByRole("button", { name: "Continue to Secure Payment" })).toBeVisible();
    await expect(page.getByText(CARD_CURRENCY_NOTICE)).toBeVisible();
    await expect(page.getByText(codOptionLabel)).toBeVisible();
    await expect(page.getByText("+$0.00")).toHaveCount(0);
    await expect(page.getByText("Cash on Delivery fee")).toHaveCount(0);
    expect((await page.locator("body").innerText()).toLowerCase()).not.toContain("sandbox");
    const cardTotal = await checkoutTotal(page);

    await page.getByText(codOptionLabel).click();
    await expect(page.getByRole("button", { name: "Place Order" })).toBeVisible();
    await expect(page.getByText(codOptionLabel)).toBeVisible();
    await expect(page.getByText(CARD_CURRENCY_NOTICE)).toBeVisible();
    await expect(page.getByText("+$0.00")).toHaveCount(0);
    await expect(page.getByText("Cash on Delivery fee")).toHaveCount(0);
    expect(await checkoutTotal(page)).toBe(cardTotal);
    expect((await page.locator("body").innerText()).toLowerCase()).not.toContain("sandbox");
  }
});
