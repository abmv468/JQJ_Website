import type { Page } from "@playwright/test";

export async function fillCheckout(page: Page) {
  await page.locator("#checkout-email").fill("buyer@example.com");
  await page.locator("#checkout-firstName").fill("Ada");
  await page.locator("#checkout-lastName").fill("Lovelace");
  await page.locator("#checkout-address").fill("1 Example Street");
  await page.locator("#checkout-city").fill("Austin");
  await page.locator("#checkout-postalCode").fill("78701");
}
