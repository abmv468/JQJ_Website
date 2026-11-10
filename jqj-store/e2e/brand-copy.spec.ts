import { expect, test, type Page } from "@playwright/test";

const BANNED =
  /\b(?:hand-crafted|handcrafted|hand-finished|hand-made|hand made|handmade|craftsmanship|artisanal|artisan|atelier|crafted|craft|express)\b|worldwide|\bUPS\b/i;

const DELIVERY_RANGE =
  "Dispatched in 1–3 business days, then typically 7–12 days in transit. Customs and peak season can add time.";

const PAGES = [
  "/",
  "/story",
  "/care",
  "/bracelets",
  "/shipping",
  "/faqs",
  "/terms",
  "/cart",
  "/checkout",
  "/products/pearl-silver-necklace-v",
];

async function stubNetwork(page: Page) {
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
  await page.route(/\/api\/products\/availability/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        product: {
          inStock: true,
          stockCount: 5,
          lowStockThreshold: 5,
          variants: [],
        },
      }),
    })
  );
}

async function visibleCopy(page: Page) {
  const body = await page.locator("body").innerText();
  const description = (await page.locator('meta[name="description"]').getAttribute("content")) ?? "";
  const alts = await page.locator("img").evaluateAll((images) =>
    images.map((image) => (image as HTMLImageElement).alt)
  );
  return [body, description, ...alts].join("\n");
}

test.beforeEach(async ({ page }) => {
  await stubNetwork(page);
});

for (const path of PAGES) {
  test(`${path} renders none of the banned craft words, worldwide, or UPS`, async ({ page }) => {
    await page.goto(path);
    let copy = await visibleCopy(page);
    if (path.startsWith("/products/")) {
      await page.getByRole("button", { name: "Specifications" }).click();
      copy += `\n${await visibleCopy(page)}`;
      await page.getByRole("button", { name: "Shipping & Return" }).click();
      copy += `\n${await visibleCopy(page)}`;
    }
    expect(copy).not.toMatch(BANNED);
    expect(await page.title()).not.toMatch(BANNED);
  });
}

test("home shows The Pearl Edit and the free-shipping line", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("The Pearl Edit")).toBeVisible();
  await expect(page.getByText("Free shipping on orders over $250").first()).toBeVisible();
  await expect(page.getByText("Pearl Atelier")).toHaveCount(0);
});

test("pearl necklace spec row reads Origin: Designed in Hong Kong", async ({ page }) => {
  await page.goto("/products/pearl-silver-necklace-v");
  await page.getByRole("button", { name: "Specifications" }).click();
  await expect(page.getByText("Origin: Designed in Hong Kong")).toBeVisible();
});

test("product and shipping pages do not contain UPS or Complimentary", async ({ page }) => {
  await page.goto("/shipping");
  const shipping = await page.locator("body").innerText();
  expect(shipping).not.toMatch(/\bUPS\b/i);
  expect(shipping).not.toMatch(/complimentary/i);
  expect(shipping).not.toMatch(/expedit/i);
  expect(shipping).toContain(DELIVERY_RANGE);

  await page.goto("/products/pearl-silver-necklace-v");
  await page.getByRole("button", { name: "Shipping & Return" }).click();
  const product = await page.locator("body").innerText();
  expect(product).not.toMatch(/\bUPS\b/i);
  expect(product).not.toMatch(/complimentary/i);
  expect(product).toContain("Free shipping on orders over $250");
  expect(product).toContain("Return shipping is paid by the customer.");
});

test("FAQ uses DELIVERY_RANGE and drops the old hyphenated dispatch answer", async ({ page }) => {
  await page.goto("/faqs");
  const faq = await page.locator("body").innerText();
  expect(faq).toContain(DELIVERY_RANGE);
  expect(faq).not.toContain("Most in-stock orders ship within 1-3 business days.");
  expect(faq).not.toContain("1-3 business days");
  expect(faq).not.toMatch(/worldwide|\bUPS\b/i);
});
