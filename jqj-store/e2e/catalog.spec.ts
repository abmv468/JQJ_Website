import { expect, test, type Page } from "@playwright/test";

const CART_KEY = "JQD-cart";

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

async function waitForCart(page: Page) {
  await page.waitForFunction((key) => {
    const raw = localStorage.getItem(key);
    return Boolean(raw && JSON.parse(raw).length > 0);
  }, CART_KEY);
}

test.beforeEach(async ({ page }) => {
  await stubExternalHosts(page);
});

test("live availability shows the fetched stock count", async ({ page }) => {
  await page.route(/\/api\/products\/availability/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        product: {
          inStock: true,
          stockCount: 2,
          lowStockThreshold: 5,
          variants: [],
        },
      }),
    })
  );

  await page.goto("/products/sodalite-bracelet-viii");
  await expect(page.getByTestId("stock-status")).toHaveText("Low stock — only 2 left");
  await expect(page.getByRole("button", { name: "Add to Cart" })).toBeEnabled();
});

test("a failed availability response does not claim stock and still adds to cart", async ({ page }) => {
  await page.route(/\/api\/products\/availability/, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "unavailable" }),
    })
  );

  await page.goto("/products/amethyst-bracelet-xv");
  await expect(page.locator("[data-stock-state='unknown']")).toBeVisible();
  await expect(page.getByTestId("stock-status")).toHaveCount(0);
  await expect(page.getByText("In stock")).toHaveCount(0);
  await expect(page.getByText("Out of stock")).toHaveCount(0);
  await expect(page.getByText(/only \d+ left/)).toHaveCount(0);
  await page.getByRole("button", { name: "Add to Cart" }).click();
  await waitForCart(page);
});

test("an availability timeout does not claim stock and still adds to cart", async ({ page }) => {
  await page.route(/\/api\/products\/availability/, () => new Promise(() => {}));

  await page.goto("/products/labradorite-bracelet-v");
  await expect(page.locator("[data-stock-state='unknown']")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("stock-status")).toHaveCount(0);
  await expect(page.getByText("In stock")).toHaveCount(0);
  await expect(page.getByText("Out of stock")).toHaveCount(0);
  await expect(page.getByText(/only \d+ left/)).toHaveCount(0);
  await page.getByRole("button", { name: "Add to Cart" }).click();
  await waitForCart(page);
});

test("a malformed availability body stays neutral and leaves cart and checkout usable", async ({
  page,
}) => {
  await page.route(/\/api\/products\/availability/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ product: { inStock: true } }),
    })
  );

  await page.goto("/products/amethyst-bracelet-xv");
  await expect(page.locator("[data-stock-state='unknown']")).toBeVisible();
  await expect(page.getByTestId("stock-status")).toHaveCount(0);
  await expect(page.getByText(/out of stock/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Add to Cart" }).click();
  await waitForCart(page);

  const cartAvailability = page.waitForResponse((response) =>
    response.url().includes("/api/products/availability")
  );
  await page.goto("/cart");
  await cartAvailability;
  await expect(page.getByText("Amethyst Bracelet XV (5mm)").first()).toBeVisible();
  await expect(page.getByText(/out of stock/i)).toHaveCount(0);
  const checkoutLink = page.getByRole("link", { name: "Checkout", exact: true });
  await expect(checkoutLink).toBeVisible();
  await expect(checkoutLink).toBeEnabled();

  const checkoutAvailability = page.waitForResponse((response) =>
    response.url().includes("/api/products/availability")
  );
  await page.goto("/checkout");
  await checkoutAvailability;
  const submit = page.getByRole("button", { name: "Continue to Secure Payment" });
  await expect(submit).toBeVisible();
  await expect(submit).toBeEnabled();
  await expect(page.getByText(/out of stock/i)).toHaveCount(0);
  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), CART_KEY))
    .toContain("amethyst-bracelet-xv");
});

test("selecting Labradorite shows both Labradorite products", async ({ page }) => {
  await page.goto("/new");
  await page.locator("aside").getByRole("button", { name: "Labradorite", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Labradorite Bracelet V (8mm)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Labradorite Silver Pendant" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Amethyst Bracelet XV (5mm)" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Pearl - Silver Necklace V (7mm)" })).toHaveCount(0);
});
