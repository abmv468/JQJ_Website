import { expect, test, type Page } from "@playwright/test";

const CART_KEY = "JQD-cart";
const CARD_RADIO_NAME = "Credit / Debit Card (Airwallex Hosted Checkout)";
const CARD_UNAVAILABLE =
  "Card payments are temporarily unavailable — please choose cash on delivery or try again later.";

async function openCheckout(page: Page) {
  await page.goto("/products/amethyst-bracelet-xv");
  await page.getByRole("button", { name: "Add to Cart" }).click();
  await page.waitForFunction((key) => {
    const raw = localStorage.getItem(key);
    return Boolean(raw && JSON.parse(raw).length > 0);
  }, CART_KEY);
  await page.goto("/checkout");
}

function deferCardConfig(page: Page) {
  let release: (cardEnabled: boolean) => void = () => {};
  const result = new Promise<boolean>((resolve) => {
    release = resolve;
  });
  let markRequested: () => void = () => {};
  const requested = new Promise<void>((resolve) => {
    markRequested = resolve;
  });
  const installed = page.route(/\/api\/checkout\/airwallex$/, async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    markRequested();
    const cardEnabled = await result;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "no-store" },
      body: JSON.stringify({ cardEnabled }),
    });
  });
  return { installed, requested, release };
}

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

test("a pending card config leaves the card selected and enabled", async ({ page }) => {
  const config = deferCardConfig(page);
  await config.installed;
  await openCheckout(page);
  await config.requested;

  const card = page.getByRole("radio", { name: CARD_RADIO_NAME });
  await expect(card).toBeChecked();
  await expect(card).toBeEnabled();
  await expect(card).not.toHaveAttribute("aria-describedby");
  await expect(page.getByRole("radio", { name: /Cash on Delivery/ })).not.toBeChecked();
  await expect(page.locator("#card-payments-unavailable")).toHaveCount(0);

  config.release(true);
  await expect(card).toBeChecked();
  await expect(card).toBeEnabled();
});

test("disabled card payments select cash on delivery and describe the card radio", async ({
  page,
}) => {
  await page.route(/\/api\/checkout\/airwallex$/, async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "no-store" },
      body: JSON.stringify({ cardEnabled: false }),
    });
  });

  await openCheckout(page);

  const card = page.getByRole("radio", { name: CARD_RADIO_NAME });
  await expect(page.getByRole("radio", { name: /Cash on Delivery/ })).toBeChecked();
  await expect(card).toBeDisabled();
  await expect(card).toHaveAttribute("aria-describedby", "card-payments-unavailable");
  await expect(page.locator("#card-payments-unavailable")).toHaveText(CARD_UNAVAILABLE);
});

test("a selected card switches to cash on delivery and announces it", async ({ page }) => {
  const config = deferCardConfig(page);
  await config.installed;
  await openCheckout(page);
  await config.requested;

  const card = page.getByRole("radio", { name: CARD_RADIO_NAME });
  await expect(card).toBeEnabled();
  await card.check();
  await expect(card).toBeChecked();

  config.release(false);

  await expect(page.getByRole("radio", { name: /Cash on Delivery/ })).toBeChecked();
  await expect(card).toBeDisabled();
  await expect(card).toHaveAttribute("aria-describedby", "card-payments-unavailable");
  await expect(page.getByRole("status")).toHaveText(CARD_UNAVAILABLE);
});

test("cash on delivery shows the fee and confirms the order", async ({ page }) => {
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
  await page.getByText("Cash on Delivery", { exact: false }).first().click();
  await expect(page.getByText("Cash on Delivery fee")).toBeVisible();
  await expect(page.getByText("$20.00").first()).toBeVisible();
  await page.getByRole("button", { name: "Place Order" }).click();
  await expect(page).toHaveURL(/method=cod/);
  await expect(page.getByText("Your Cash on Delivery order has been placed.")).toBeVisible();
});
