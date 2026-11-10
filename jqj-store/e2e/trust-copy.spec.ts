import { expect, test, type Page } from "@playwright/test";
import { shippingAndReturnsAccordionText } from "../components/product/ProductDetail";
import {
  RETURNS_DAYS,
  TRANSIT_DAYS_MAX,
  TRANSIT_DAYS_MIN,
} from "../lib/policy";
import { FREE_SHIPPING_THRESHOLD_USD } from "../lib/shipping";

const WITHDRAWN_TRUST_LINE = "Hand-finished natural stone jewellery · Secure checkout";

async function openPage(page: Page, url: string) {
  const response = await page.goto(url);
  expect(response?.status()).toBeLessThan(400);
  const html = await page.content();
  expect(html).not.toMatch(/aggregateRating|reviewCount|9929|4\.8\/5\.0|out of 5|Top Rated|Satisfaction Guarantee|Complimentary UPS/i);
  expect(html).not.toMatch(/\d+ reviews/i);
  expect(html).not.toContain(WITHDRAWN_TRUST_LINE);
  expect(html).not.toMatch(/collector benefits/i);
  return html;
}

test("home has no fabricated reviews and no withdrawn trust line", async ({ page }) => {
  await openPage(page, "/");
  await expect(page.getByText(WITHDRAWN_TRUST_LINE)).toHaveCount(0);
  await expect(page.getByText(`${RETURNS_DAYS}-day returns`)).toBeVisible();
  await expect(page.getByText("Museum-inspired craftsmanship since 2015")).toBeVisible();
  await expect(page.getByText("4.8/5.0")).toHaveCount(0);
});

test("a necklace page has no ratings and states shipping and returns", async ({ page }) => {
  await openPage(page, "/products/pearl-silver-necklace-v");
  await page.getByRole("button", { name: "Shipping & Returns" }).click();
  await expect(
    page.getByText(shippingAndReturnsAccordionText(FREE_SHIPPING_THRESHOLD_USD))
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Returns Policy" })).toHaveAttribute("href", "/returns");
  await expect(page.getByText("Designed in Hong Kong")).toBeVisible();
  await expect(page.getByText(/first resize/i)).toHaveCount(0);
  await expect(page.getByText(/Complimentary UPS/i)).toHaveCount(0);
});

test("a bracelet page uses the shared shipping and returns accordion", async ({ page }) => {
  await openPage(page, "/products/red-leopard-skin-jasper-bracelet-iii");
  await page.getByRole("button", { name: "Shipping & Returns" }).click();
  const accordion = page.getByText(shippingAndReturnsAccordionText(FREE_SHIPPING_THRESHOLD_USD));
  await expect(accordion).toBeVisible();
  await expect(accordion).not.toContainText(/first resize/i);
  await expect(accordion).not.toContainText(/Complimentary UPS/i);
});

test("the necklaces grid does not sort or label by fabricated ratings", async ({ page }) => {
  await openPage(page, "/necklaces");
  await page.getByRole("button", { name: "Featured" }).click();
  await expect(page.getByRole("option", { name: "Top Rated" })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Price: Low to High" })).toBeVisible();
});

test("returns, shipping, and FAQ copy share RETURNS_DAYS", async ({ page }) => {
  await openPage(page, "/returns");
  await expect(
    page.getByText(`Return requests must be submitted within ${RETURNS_DAYS} days of delivery.`)
  ).toBeVisible();
  await expect(
    page.getByText("Customers pay return shipping unless the item arrived damaged or incorrect.")
  ).toBeVisible();
  await expect(
    page.getByText(
      `Exchange or resize requests for bracelets should be submitted within ${RETURNS_DAYS} days of delivery.`
    )
  ).toBeVisible();

  await openPage(page, "/shipping");
  await expect(
    page.getByText(
      `Returns are accepted within ${RETURNS_DAYS} days of delivery. Customers pay return shipping.`
    )
  ).toBeVisible();
  await expect(
    page.getByText(`Free shipping on orders over $${FREE_SHIPPING_THRESHOLD_USD}.`)
  ).toBeVisible();
  await expect(
    page.getByText(
      `Domestic standard shipping: typically ${TRANSIT_DAYS_MIN}–${TRANSIT_DAYS_MAX} days after dispatch.`
    )
  ).toBeVisible();
  await expect(
    page.getByText(
      `International shipping (where available): typically ${TRANSIT_DAYS_MIN}–${TRANSIT_DAYS_MAX} days, excluding customs delays.`
    )
  ).toBeVisible();
  await expect(
    page.getByText(
      "Custom, resized, or made-to-order pieces may require 5–10 business days before shipment."
    )
  ).toBeVisible();

  await openPage(page, "/faqs");
  await expect(
    page.getByText(
      `Eligible returns are accepted within ${RETURNS_DAYS} days of delivery. Customers pay return shipping.`
    )
  ).toBeVisible();
  await expect(
    page.getByText(
      `Eligible bracelet exchange and resize requests are accepted within ${RETURNS_DAYS} days of delivery.`
    )
  ).toBeVisible();
});

test("the loyalty page no longer promises collector benefits", async ({ page }) => {
  await openPage(page, "/loyalty");
  await expect(page.getByText("Join our list for new pieces and updates.")).toBeVisible();
  await expect(page.getByText(/collector benefits/i)).toHaveCount(0);
  await expect(page.getByText("Join our list for new pieces and atelier news.")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Collector Updates" })).toBeVisible();
  expect(await page.title()).toContain("JQD Group Updates — JQD Group");
});
