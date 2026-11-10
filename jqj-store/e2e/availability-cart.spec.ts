import { expect, test, type Page } from "@playwright/test";

const CART_KEY = "JQD-cart";

const cartItem = {
  id: "amethyst-xv",
  slug: "amethyst-bracelet-xv",
  name: "Amethyst Bracelet XV (5mm)",
  price: 330.99,
  image: "/products/amethyst-bracelet.webp",
  quantity: 1,
};

async function stubExternalHosts(page: Page) {
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
}

async function seedCart(page: Page) {
  await page.addInitScript((payload) => {
    localStorage.setItem(payload.key, JSON.stringify(payload.item));
  }, { key: CART_KEY, item: [cartItem] });
}

async function expectCartKept(page: Page) {
  await expect(page.getByText(cartItem.name).first()).toBeVisible();
  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), CART_KEY))
    .toContain(cartItem.slug);
}

async function expectNoStockError(page: Page) {
  await expect(page.getByText(/out of stock/i)).toHaveCount(0);
  await expect(page.getByText(/only \d+/i)).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await stubExternalHosts(page);
  await seedCart(page);
});

test("a 500 from availability leaves the cart and checkout usable", async ({ page }) => {
  await page.route(/\/api\/products\/availability/, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        errors: [`${cartItem.name} is out of stock.`],
      }),
    })
  );

  const cartAvailability = page.waitForResponse(
    (response) => response.url().includes("/api/products/availability") && response.status() === 500
  );
  await page.goto("/cart");
  await cartAvailability;
  await expectCartKept(page);
  await expectNoStockError(page);
  const checkoutLink = page.getByRole("link", { name: "Checkout", exact: true });
  await expect(checkoutLink).toBeVisible();
  await expect(checkoutLink).toBeEnabled();

  const checkoutAvailability = page.waitForResponse(
    (response) => response.url().includes("/api/products/availability") && response.status() === 500
  );
  await page.goto("/checkout");
  await checkoutAvailability;
  await expectCartKept(page);
  await expectNoStockError(page);
  const submit = page.getByRole("button", { name: "Continue to Secure Payment" });
  await expect(submit).toBeVisible();
  await expect(submit).toBeEnabled();
});

test("an availability timeout leaves the cart and checkout usable", async ({ page }) => {
  await page.route(/\/api\/products\/availability/, () => new Promise(() => {}));

  await page.goto("/cart");
  await expect(page.getByText("Checking stock…")).toBeVisible();
  await expect(page.getByText("Checking stock…")).toHaveCount(0, { timeout: 15_000 });
  await expectCartKept(page);
  await expectNoStockError(page);
  const checkoutLink = page.getByRole("link", { name: "Checkout", exact: true });
  await expect(checkoutLink).toBeVisible();
  await expect(checkoutLink).toBeEnabled();

  await page.goto("/checkout");
  const submit = page.getByRole("button", { name: "Continue to Secure Payment" });
  await expect(submit).toBeVisible();
  await expect(submit).toBeDisabled();
  await expect(submit).toBeEnabled({ timeout: 15_000 });
  await expectCartKept(page);
  await expectNoStockError(page);
});
