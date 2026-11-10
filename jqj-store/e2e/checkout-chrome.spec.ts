import { expect, test, type Locator, type Page } from "@playwright/test";

const UUID = "7c2e91a4-3b18-4f6d-9a05-6d8e1f0c4b22";

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

async function stubAvailability(page: Page) {
  await page.route(/\/api\/products\/availability$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ errors: [] }),
    })
  );
}

async function fulfillVerify(
  page: Page,
  body: Record<string, unknown>,
  status = 200
) {
  await page.route(/\/api\/checkout\/airwallex\/verify$/, (route) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    })
  );
}

async function labelLineCount(locator: Locator) {
  return locator.evaluate((element) => {
    const textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
    if (!textNode) return 0;
    const range = document.createRange();
    range.selectNodeContents(textNode);
    return range.getClientRects().length;
  });
}

test.beforeEach(async ({ page }) => {
  await stubExternalHosts(page);
  await stubAvailability(page);
});

test("checkout hides the store chrome and links back to the bag", async ({ page }) => {
  await page.goto("/checkout");

  await expect(page.getByRole("link", { name: "Back to bag", exact: true })).toBeVisible();
  await expect(page.getByText("Secure checkout", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Jewellery Quintessential home" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Returns", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Shipping", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Privacy", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Terms", exact: true })).toBeVisible();

  await expect(page.getByRole("link", { name: "Bracelets", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Necklaces", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open menu" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open search" })).toHaveCount(0);
  await expect(page.getByLabel("Currency")).toHaveCount(0);
  await expect(page.getByText("Free worldwide shipping")).toHaveCount(0);
  await expect(page.getByText("Stay in the Loop")).toHaveCount(0);
});

test("other store pages keep the full header", async ({ page }) => {
  for (const path of ["/", "/cart"]) {
    await page.goto(path);
    const headerNav = page.getByRole("navigation").first();
    await expect(headerNav.getByRole("link", { name: "Bracelets", exact: true })).toBeVisible();
    await expect(headerNav.getByRole("link", { name: "Necklaces", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "JQD Group home" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open search" })).toBeVisible();
    await expect(page.getByLabel("Currency")).toBeVisible();
    await expect(page.getByText("Free worldwide shipping")).toBeVisible();
    await expect(page.locator('button[aria-label="Open menu"]')).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Back to bag" })).toHaveCount(0);
  }
});

test("invalid confirmation heading uses an apostrophe and offers support", async ({ page }) => {
  await page.goto("/order-confirmation");
  const heading = page.getByRole("heading", { name: /confirm your order/i });
  await expect(heading).toBeVisible();
  await expect(heading).toHaveText("We couldn't confirm your order");
  await expect(heading).not.toContainText("&apos;");
  expect(await heading.evaluate((element) => element.innerHTML)).not.toContain("&apos;");
  await expect(page.getByRole("link", { name: "support@jqdgroup.com" })).toHaveAttribute(
    "href",
    "mailto:support@jqdgroup.com"
  );
});

test("verifying and confirming states expose a status spinner", async ({ page }) => {
  await page.route(/\/api\/checkout\/airwallex\/verify$/, () => undefined);
  await page.goto(`/order-confirmation?provider=airwallex&order_id=${UUID}`);
  const verifying = page.getByRole("status");
  await expect(verifying).toBeVisible();
  await expect(verifying).toContainText("Verifying your payment status…");
  await expect(verifying.locator("span")).toBeVisible();

  await page.unroute(/\/api\/checkout\/airwallex\/verify$/);
  await page.route(/\/api\/checkout\/verify$/, () => undefined);
  await page.goto("/order-confirmation?session_id=cs_test_e2e");
  const confirming = page.getByRole("status");
  await expect(confirming).toBeVisible();
  await expect(confirming).toContainText("Confirming your order…");
  await expect(confirming.locator("span")).toBeVisible();
});

test("failed and cancelled confirmation states link to support", async ({ page }) => {
  await fulfillVerify(
    page,
    {
      orderId: UUID,
      paymentStatus: "failed",
      succeeded: false,
      failed: true,
      pending: false,
    },
    402
  );
  await page.goto(`/order-confirmation?provider=airwallex&order_id=${UUID}&state=failed`);
  await expect(page.getByRole("heading", { name: "Payment was not completed" })).toBeVisible();
  await expect(page.getByRole("link", { name: "support@jqdgroup.com" })).toHaveAttribute(
    "href",
    "mailto:support@jqdgroup.com"
  );
  await expect(page.locator("span.break-all")).toHaveText(UUID);

  await fulfillVerify(
    page,
    {
      orderId: UUID,
      paymentStatus: "cancelled",
      succeeded: false,
      failed: true,
      pending: false,
    },
    402
  );
  await page.goto(`/order-confirmation?provider=airwallex&order_id=${UUID}&state=cancelled`);
  await expect(page.getByRole("heading", { name: "Payment was cancelled" })).toBeVisible();
  await expect(page.getByRole("link", { name: "support@jqdgroup.com" })).toHaveAttribute(
    "href",
    "mailto:support@jqdgroup.com"
  );
});

test.describe("confirmation actions on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("stacks long labels on one line each", async ({ page }) => {
    await fulfillVerify(
      page,
      {
        orderId: UUID,
        paymentStatus: "pending",
        succeeded: false,
        failed: false,
        pending: true,
      },
      202
    );
    await page.goto(`/order-confirmation?provider=airwallex&order_id=${UUID}`);
    const checkStatus = page.getByRole("button", { name: "Check Payment Status" });
    const returnToCheckout = page.getByRole("link", { name: "Return to Checkout" });
    await expect(checkStatus).toBeVisible();
    expect(await labelLineCount(checkStatus)).toBe(1);

    const checkBox = await checkStatus.boundingBox();
    const returnBox = await returnToCheckout.boundingBox();
    expect(checkBox).not.toBeNull();
    expect(returnBox).not.toBeNull();
    expect(checkBox!.width).toBeGreaterThan(300);
    expect(returnBox!.y).toBeGreaterThan(checkBox!.y + checkBox!.height - 1);

    await page.goto(`/order-confirmation?method=cod&order_id=${UUID}`);
    const continueShopping = page.getByRole("link", { name: "Continue Shopping" });
    await expect(continueShopping).toBeVisible();
    expect(await labelLineCount(continueShopping)).toBe(1);
    const continueBox = await continueShopping.boundingBox();
    expect(continueBox!.width).toBeGreaterThan(300);
  });
});
