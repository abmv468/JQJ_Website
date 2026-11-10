import { expect, test, type Page } from "@playwright/test";

const CART_KEY = "JQD-cart";

async function fillCheckout(page: Page) {
  await page.getByPlaceholder("Email", { exact: true }).fill("buyer@example.com");
  await page.getByPlaceholder("First name", { exact: true }).fill("Ada");
  await page.getByPlaceholder("Address", { exact: true }).fill("1 Atelier Lane");
  await page.getByPlaceholder("City", { exact: true }).fill("Austin");
}

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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const store: { type: string; env?: string; intent_id?: string }[] = JSON.parse(
      sessionStorage.getItem("aw-calls") ?? "[]"
    );
    window.AirwallexComponentsSDK = {
      init: async (config) => {
        store.push({ type: "init", env: config.env });
        sessionStorage.setItem("aw-calls", JSON.stringify(store));
        return {
          payments: {
            redirectToCheckout: async (props) => {
              store.push({ type: "redirect", intent_id: props.intent_id });
              sessionStorage.setItem("aw-calls", JSON.stringify(store));
              window.location.assign(props.successUrl);
            },
          },
        };
      },
    };
  });
  await stubExternalHosts(page);
  await page.route(/\/api\/products\/availability$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ errors: [] }),
    })
  );
});

test("card checkout redirects through the stubbed Airwallex SDK and clears the cart", async ({
  page,
}) => {
  const captured: {
    body: {
      currency?: string;
      idempotencyKey?: string;
      items?: { slug?: string }[];
    } | null;
  } = { body: null };

  await page.route(/\/api\/checkout\/airwallex$/, async (route) => {
    captured.body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        orderId: "order-e2e-1",
        intentId: "int_e2e",
        clientSecret: "secret_e2e",
        currency: "USD",
        sdkEnv: "demo",
        countryCode: "US",
      }),
    });
  });
  await page.route(/\/api\/checkout\/airwallex\/verify$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        orderId: "order-e2e-1",
        paymentStatus: "succeeded",
        succeeded: true,
        failed: false,
        pending: false,
        inventoryReserved: true,
      }),
    })
  );

  await page.goto("/products/amethyst-bracelet-xv");
  await page.getByRole("button", { name: "Add to Cart" }).click();
  await page.waitForFunction((key) => {
    const raw = localStorage.getItem(key);
    return Boolean(raw && JSON.parse(raw).length > 0);
  }, CART_KEY);

  await page.goto("/checkout");
  await fillCheckout(page);
  await page.getByRole("button", { name: "Continue to Secure Payment" }).click();

  await expect(page.getByRole("heading", { name: "Thank you for your order" })).toBeVisible();
  await expect(page.getByText("Your Airwallex payment was successful.")).toBeVisible();
  await page.waitForFunction((key) => {
    const raw = localStorage.getItem(key);
    return !raw || JSON.parse(raw).length === 0;
  }, CART_KEY);

  expect(captured.body?.currency).toBe("USD");
  expect(captured.body?.idempotencyKey).toEqual(expect.any(String));
  expect(captured.body?.items?.[0]?.slug).toBe("amethyst-bracelet-xv");
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

test("cash on delivery confirms the order without a fee row", async ({ page }) => {
  await page.route(/\/api\/checkout\/cod$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ orderId: "order-cod-1" }),
    })
  );

  await page.goto("/products/amethyst-bracelet-xv");
  await page.getByRole("button", { name: "Add to Cart" }).click();
  await page.waitForFunction((key) => {
    const raw = localStorage.getItem(key);
    return Boolean(raw && JSON.parse(raw).length > 0);
  }, CART_KEY);
  await page.goto("/checkout");
  await fillCheckout(page);
  await page.getByText("Cash on delivery", { exact: true }).click();
  await expect(page.getByText("Cash on Delivery fee")).toHaveCount(0);
  await expect(page.getByText("+$0.00")).toHaveCount(0);
  await page.getByRole("button", { name: "Place Order" }).click();
  await expect(page).toHaveURL(/method=cod/);
  await expect(page.getByText("Your Cash on Delivery order has been placed.")).toBeVisible();
});
