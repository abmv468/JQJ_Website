import { expect, test } from "@playwright/test";

test("collection and product pages render awaited searchParams and params", async ({ page }) => {
  await page.goto("/necklaces");
  await expect(page).toHaveTitle("Gemstone Necklaces | JQD Group");
  await expect(page.getByRole("heading", { name: "Necklaces", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Blue Lace Agate Silver Pendant", exact: true })
  ).toBeVisible();

  await page.goto("/bracelets?stone=Amethyst");
  await expect(page).toHaveTitle("Natural Stone Bracelets | JQD Group");
  await expect(page.getByRole("heading", { name: "Bracelets", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Amethyst Bracelet XV (5mm)", exact: true })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /Sodalite Bracelet VIII/ })).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  await page.goto("/new?q=pendant");
  await expect(page).toHaveTitle("New Natural Stone Jewelry | JQD Group");
  await expect(page.getByRole("heading", { name: "New Arrivals", exact: true })).toBeVisible();

  await page.goto("/products/amethyst-bracelet-xv");
  await expect(page).toHaveTitle("Amethyst Bracelet XV (5mm) | JQD Group");
  await expect(
    page.getByRole("heading", { name: "Amethyst Bracelet XV (5mm)", exact: true })
  ).toBeVisible();

  await page.goto(
    "/auth/verify?status=success&message=Your%20email%20has%20been%20verified.&next=%2Faccount"
  );
  await expect(page.getByRole("heading", { name: "Verification complete" })).toBeVisible();
  await expect(page.getByText("Your email has been verified.")).toBeVisible();
});

test("the image optimizer serves a local product image", async ({ request }) => {
  const response = await request.get(
    "/_next/image?url=%2Fproducts%2Famethyst-bracelet-xv-1.jpg&w=640&q=75"
  );
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"] ?? "").toMatch(/^image\//);
});
