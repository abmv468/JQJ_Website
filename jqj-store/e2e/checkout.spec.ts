import { expect, test } from "@playwright/test";
import {
  checkoutExpectations,
  quoteCheckout,
  shippingUsd,
  toCents,
} from "./helpers/checkout-expectations";
import {
  CART_KEY,
  addProductToCart,
  assertCurrentConfirmation,
  catalogUnitPrice,
  expectCartCleared,
  fillCheckout,
  installCheckoutIsolation,
  submitAndAssertParity,
} from "./helpers/checkout-parity";

const UNDER_THRESHOLD_SLUG = "blue-lace-agate-silver-pendant";
const OVER_THRESHOLD_SLUG = "amethyst-bracelet-xv";

test.beforeEach(async ({ page, baseURL }) => {
  await installCheckoutIsolation(page, baseURL);
});

test("aborts a browser request to an external host", async ({ page }) => {
  await page.goto("/");
  const [failed, result] = await Promise.all([
    page.waitForEvent("requestfailed", {
      predicate: (request) => request.url() === "https://example.com/",
    }),
    page.evaluate(async () => {
      try {
        await fetch("https://example.com/");
        return "fulfilled";
      } catch {
        return "rejected";
      }
    }),
  ]);
  expect(result).toBe("rejected");
  expect(failed.failure()?.errorText ?? "").toContain("ERR_BLOCKED_BY_CLIENT");
});

test("card checkout under the free-shipping announcement matches the server total", async ({
  page,
}, testInfo) => {
  const quote = quoteCheckout(
    [{ unitPriceUsd: catalogUnitPrice(UNDER_THRESHOLD_SLUG), quantity: 1 }],
    "airwallex"
  );
  expect(toCents(quote.subtotal)).toBeLessThan(
    toCents(checkoutExpectations.announcedFreeShippingSubtotalUsd)
  );
  expect(quote.shipping).toBe(shippingUsd(quote.subtotal));

  await addProductToCart(page, UNDER_THRESHOLD_SLUG);
  await page.goto("/checkout");
  await fillCheckout(page);
  const result = await submitAndAssertParity(page, testInfo, "airwallex", "order-e2e-under");

  expect(toCents(result.ui.shipping)).toBe(toCents(quote.shipping));
  expect(toCents(result.ui.total)).toBe(toCents(quote.total));
  expect(result.request.currency).toBe("USD");
  expect(result.request.items?.[0]?.slug).toBe(UNDER_THRESHOLD_SLUG);

  await assertCurrentConfirmation(page, "order-e2e-under", "airwallex");
  await expectCartCleared(page);
});

test("card checkout at or over the free-shipping announcement redirects through the stubbed SDK and matches the server total", async ({
  page,
}, testInfo) => {
  const quote = quoteCheckout(
    [{ unitPriceUsd: catalogUnitPrice(OVER_THRESHOLD_SLUG), quantity: 1 }],
    "airwallex"
  );
  expect(toCents(quote.subtotal)).toBeGreaterThanOrEqual(
    toCents(checkoutExpectations.announcedFreeShippingSubtotalUsd)
  );
  expect(quote.shipping).toBe(shippingUsd(quote.subtotal));

  await addProductToCart(page, OVER_THRESHOLD_SLUG);
  await page.goto("/checkout");
  await fillCheckout(page);
  const result = await submitAndAssertParity(page, testInfo, "airwallex", "order-e2e-1");

  expect(toCents(result.ui.shipping)).toBe(toCents(quote.shipping));
  expect(toCents(result.ui.codFee)).toBe(0);
  expect(result.request.currency).toBe("USD");
  expect(result.request.idempotencyKey).toEqual(expect.any(String));
  expect(result.request.items?.[0]?.slug).toBe(OVER_THRESHOLD_SLUG);

  await assertCurrentConfirmation(page, "order-e2e-1", "airwallex");
  await expectCartCleared(page);

  const calls = await page.evaluate(() => JSON.parse(sessionStorage.getItem("aw-calls") ?? "[]"));
  expect(calls).toEqual(
    expect.arrayContaining([
      { type: "init", env: "demo" },
      { type: "redirect", intent_id: "int_e2e" },
    ])
  );
});

test("a failed Airwallex return keeps the cart and shows support copy", async ({ page }) => {
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
  await page.route(/\/api\/checkout\/airwallex\/verify$/, (route) =>
    route.fulfill({
      status: 402,
      contentType: "application/json",
      body: JSON.stringify({
        orderId: "order-e2e-1",
        paymentStatus: "failed",
        succeeded: false,
        failed: true,
        pending: false,
      }),
    })
  );

  await page.goto("/order-confirmation?provider=airwallex&order_id=order-e2e-1&state=failed");
  await expect(page.getByRole("heading", { name: "Payment was not completed" })).toBeVisible();
  await expect(page.getByRole("link", { name: "support@jqdgroup.com" })).toBeVisible();
  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), CART_KEY))
    .toContain("amethyst-bracelet-xv");
});

test("cash on delivery shows the configured fee and matches the server total", async ({
  page,
}, testInfo) => {
  const quote = quoteCheckout(
    [{ unitPriceUsd: catalogUnitPrice(OVER_THRESHOLD_SLUG), quantity: 1 }],
    "cod"
  );
  expect(quote.codFee).toBe(checkoutExpectations.codFeeUsd);
  expect(quote.shipping).toBe(shippingUsd(quote.subtotal));

  await addProductToCart(page, OVER_THRESHOLD_SLUG);
  await page.goto("/checkout");
  await fillCheckout(page);
  const result = await submitAndAssertParity(page, testInfo, "cod", "order-cod-1");

  expect(toCents(result.ui.codFee)).toBe(toCents(quote.codFee));
  expect(toCents(result.ui.total)).toBe(toCents(quote.total));
  expect(result.request.items?.[0]?.slug).toBe(OVER_THRESHOLD_SLUG);

  await expect(page).toHaveURL(/method=cod/);
  await assertCurrentConfirmation(page, "order-cod-1", "cod");
  await expectCartCleared(page);
});
