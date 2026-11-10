import { expect, test } from "@playwright/test";
import { FREE_SHIPPING_THRESHOLD_USD } from "../lib/shipping";

const SLUG = "red-leopard-skin-jasper-bracelet-iii";
const NAME = "Red Leopard Skin Jasper Cube Bracelet";
const ONLY_IMAGE = "red-leopard-jasper-bracelet.webp";
const DESCRIPTION =
  "Cut into clean cubes, Red Leopard Skin Jasper shows its natural spotted pattern in warm reds, rose, cream and earthy browns, so no two beads look quite alike. Small dark spacers sit between the stones, and a single silver-tone cube with an engraved mark adds a quiet point of light to the strand. Designed in Hong Kong with materials sourced from around the world, it is a considered piece for everyday wear, and arrives gift-ready.";

test("product page shows the cube bracelet name and only the webp gallery", async ({ page }) => {
  await page.goto(`/products/${SLUG}`);

  await expect(page.getByRole("heading", { level: 1, name: NAME })).toBeVisible();
  const productInfo = page.locator("div.lg\\:pl-6");
  await expect(productInfo.locator(".line-through")).toHaveCount(0);
  await expect(productInfo.getByText("Sale — Save")).toHaveCount(0);
  await expect(productInfo.getByText("$599.99")).toBeVisible();
  await expect(
    productInfo.getByText(`Free shipping on orders over $${FREE_SHIPPING_THRESHOLD_USD}`, {
      exact: true,
    })
  ).toBeVisible();

  const gallery = page.locator("div.grid.gap-12 > div").first();
  const images = gallery.locator("img");
  await expect(images).toHaveCount(1);

  const src = decodeURIComponent((await images.first().getAttribute("src")) ?? "");
  const srcset = decodeURIComponent((await images.first().getAttribute("srcset")) ?? "");
  const rendered = `${src} ${srcset}`;
  expect(rendered).toContain(ONLY_IMAGE);
  expect(rendered).not.toMatch(/\.jpe?g|\.png/i);

  const detail = page.locator("div.container-site.py-12");
  const detailText = await detail.innerText();
  expect(detailText).not.toMatch(/handmade|hand-made|hand-finished|handcrafted|atelier/i);
  expect(detailText).not.toMatch(/logo/i);
  expect(detailText).not.toContain("6mm");
  expect(detailText).not.toContain("Sterling");
  expect(detailText).not.toMatch(/clasp/i);

  const schemas = await page.locator('script[type="application/ld+json"]').allTextContents();
  const data = schemas
    .map((raw) => JSON.parse(raw) as { "@type"?: string; name?: string; description?: string; image?: string[]; aggregateRating?: unknown })
    .find((entry) => entry["@type"] === "Product");
  expect(data?.name).toBe(NAME);
  expect(data?.description).toBe(DESCRIPTION);
  expect(data?.aggregateRating).toBeUndefined();
  expect(JSON.stringify(data)).not.toContain("aggregateRating");
  expect(data?.image?.every((url) => url.includes(ONLY_IMAGE))).toBe(true);
  expect(data?.image?.some((url) => /\.jpe?g|\.png/i.test(url))).toBe(false);
});
