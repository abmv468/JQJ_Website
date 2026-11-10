import { expect, test, type Page } from "@playwright/test";
import { RETURNS_DAYS, TRUST_LINE } from "../lib/policy";

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

test("home has no fabricated reviews and no trust line while v4 is pending", async ({ page }) => {
  expect(TRUST_LINE).toBe("");
  await openPage(page, "/");
  await expect(page.getByText(WITHDRAWN_TRUST_LINE)).toHaveCount(0);
  await expect(page.getByText(`${RETURNS_DAYS}-day returns`)).toBeVisible();
  await expect(page.getByText("Museum-inspired craftsmanship since 2015")).toBeVisible();
  await expect(page.getByText("4.8/5.0")).toHaveCount(0);
});

test("a necklace page has no ratings and states the return window", async ({ page }) => {
  await openPage(page, "/products/pearl-silver-necklace-v");
  await page.getByRole("button", { name: "Shipping & Return" }).click();
  await expect(
    page.getByText(
      `Returns are accepted within ${RETURNS_DAYS} days of delivery. Customers pay return shipping.`
    )
  ).toBeVisible();
  await expect(page.getByText(/first resize/i)).toHaveCount(0);
  await expect(page.getByText(/Complimentary UPS/i)).toHaveCount(0);
});

test("a bracelet page keeps resize copy bracelet-scoped", async ({ page }) => {
  await openPage(page, "/products/red-leopard-skin-jasper-bracelet-iii");
  await page.getByRole("button", { name: "Shipping & Return" }).click();
  await expect(
    page.getByText(
      `Exchange or resize requests for bracelets are accepted within ${RETURNS_DAYS} days of delivery, including a complimentary first resize for new customers.`
    )
  ).toBeVisible();
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
  await expect(page.getByText(/Customers pay return shipping/)).toBeVisible();
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
  await expect(page.getByText("Use the newsletter form in the footer to receive updates.")).toBeVisible();
  await expect(page.getByText(/collector benefits/i)).toHaveCount(0);
  await expect(page.getByText("Join our list for new pieces and atelier news.")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Collector Updates" })).toBeVisible();
  expect(await page.title()).toContain("JQD Group Updates — JQD Group");
});
