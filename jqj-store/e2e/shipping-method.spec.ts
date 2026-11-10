import { expect, test, type Page, type Route } from "@playwright/test";

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

async function seedCart(page: Page) {
  await page.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify([
        {
          id: "amethyst-xv",
          slug: "amethyst-bracelet-xv",
          name: "Amethyst Bracelet XV (5mm)",
          price: 100,
          image: "/products/amethyst-bracelet-xv-1.jpg",
          quantity: 1,
        },
      ])
    );
  }, CART_KEY);
}

function fulfillJson(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

test.beforeEach(async ({ page }) => {
  await seedCart(page);
  await page.addInitScript(() => {
    window.AirwallexComponentsSDK = {
      init: async () => ({
        payments: {
          redirectToCheckout: async () => undefined,
        },
      }),
    };
  });
  await stubExternalHosts(page);
  await page.route(/\/api\/products\/availability$/, (route) =>
    fulfillJson(route, 200, { errors: [] })
  );
});

async function captureCardPost(page: Page) {
  const captured: { shippingMethod?: string } = {};
  await page.route(/\/api\/checkout\/airwallex$/, async (route) => {
    captured.shippingMethod = route.request().postDataJSON().shippingMethod;
    await fulfillJson(route, 200, {
      orderId: "order-e2e-1",
      intentId: "int_e2e",
      clientSecret: "secret_e2e",
      currency: "USD",
      sdkEnv: "demo",
      countryCode: "US",
    });
  });
  return captured;
}

function payButton(page: Page) {
  return page.getByRole("button", { name: "Continue to Secure Payment" });
}

async function expectStandardOnly(page: Page) {
  await expect(page.getByText("Standard shipping · Tracked delivery", { exact: true })).toBeVisible();
  await expect(page.getByText("Expedited shipping", { exact: true })).toHaveCount(0);
  await expect(page.getByText("$15.00").first()).toBeVisible();
  await expect(page.getByText("$115.00")).toBeVisible();
  await expect(payButton(page)).toBeEnabled();
}

async function submitStandard(page: Page, captured: { shippingMethod?: string }) {
  await page.getByPlaceholder("Email", { exact: true }).fill("buyer@example.com");
  await page.getByPlaceholder("First name", { exact: true }).fill("Ada");
  await page.getByPlaceholder("Address", { exact: true }).fill("1 Atelier Lane");
  await page.getByPlaceholder("City", { exact: true }).fill("Austin");
  await payButton(page).click();
  await expect.poll(() => captured.shippingMethod).toBe("standard");
}

test("a false shipping flag hides expedited and posts standard", async ({ page }) => {
  await page.route(/\/api\/checkout\/shipping$/, (route) =>
    fulfillJson(route, 200, { expressShippingEnabled: false })
  );
  const captured = await captureCardPost(page);
  await page.goto("/checkout");
  await expectStandardOnly(page);
  await submitStandard(page, captured);
});

test("a shipping flag 500 hides expedited and posts standard", async ({ page }) => {
  await page.route(/\/api\/checkout\/shipping$/, (route) =>
    fulfillJson(route, 500, { error: "unavailable" })
  );
  const captured = await captureCardPost(page);
  await page.goto("/checkout");
  await expectStandardOnly(page);
  await submitStandard(page, captured);
});

test("a hung shipping flag hides expedited and leaves submit enabled", async ({ page }) => {
  await page.route(/\/api\/checkout\/shipping$/, () => {
    // Leave the request open until the page aborts it.
  });
  const captured = await captureCardPost(page);
  const started = Date.now();
  await page.goto("/checkout");
  await expectStandardOnly(page);
  const remaining = 4_500 - (Date.now() - started);
  if (remaining > 0) await page.waitForTimeout(remaining);
  await expectStandardOnly(page);
  await submitStandard(page, captured);
});

test("a true shipping flag shows expedited shipping", async ({ page }) => {
  await page.route(/\/api\/checkout\/shipping$/, (route) =>
    fulfillJson(route, 200, { expressShippingEnabled: true })
  );
  await page.goto("/checkout");
  await expect(page.getByText("Expedited shipping", { exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Expedited shipping" })).toBeEnabled();
  await expect(page.getByRole("radio", { name: "Standard shipping · Tracked delivery" })).toBeChecked();
  await expect(payButton(page)).toBeEnabled();
});
