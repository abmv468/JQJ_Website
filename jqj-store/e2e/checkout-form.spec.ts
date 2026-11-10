import { expect, test, type Page } from "@playwright/test";
import { fillCheckout } from "./fill-checkout";

const CART_KEY = "JQD-cart";

const cartItem = {
  id: "amethyst-xv",
  slug: "amethyst-bracelet-xv",
  name: "Amethyst Bracelet XV (5mm)",
  price: 330.99,
  image: "/products/amethyst-bracelet-xv-1.jpg",
  quantity: 1,
};

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

async function openCheckout(page: Page) {
  await page.addInitScript(
    (payload: { key: string; item: typeof cartItem }) => {
      localStorage.setItem(payload.key, JSON.stringify([payload.item]));
    },
    { key: CART_KEY, item: cartItem }
  );
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { level: 1, name: "Checkout" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await stubExternalHosts(page);
  await page.route(/\/api\/products\/availability$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ errors: [] }),
    })
  );
  await page.route(/\/api\/checkout/, (route) => route.abort());
});

test("checkout fields expose labels, autocomplete, and one heading", async ({ page }) => {
  await openCheckout(page);

  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("textbox", { name: "Email Required", exact: true })).toHaveAttribute(
    "type",
    "email"
  );
  await expect(page.getByRole("combobox", { name: "Country Required", exact: true })).toHaveAttribute(
    "name",
    "country"
  );
  await expect(page.getByRole("textbox", { name: "Postcode Required", exact: true })).toHaveAttribute(
    "required",
    ""
  );

  const fields: Array<[string, string, string]> = [
    ["#checkout-email", "email", "email"],
    ["#checkout-country", "country", "country"],
    ["#checkout-firstName", "firstName", "given-name"],
    ["#checkout-lastName", "lastName", "family-name"],
    ["#checkout-address", "address", "address-line1"],
    ["#checkout-apartment", "apartment", "address-line2"],
    ["#checkout-city", "city", "address-level2"],
    ["#checkout-region", "region", "address-level1"],
    ["#checkout-postalCode", "postalCode", "postal-code"],
    ["#checkout-phone", "phone", "tel"],
  ];

  for (const [selector, name, autocomplete] of fields) {
    const control = page.locator(selector);
    await expect(control).toHaveAttribute("name", name);
    await expect(control).toHaveAttribute("autocomplete", autocomplete);
    await expect(control).not.toHaveAttribute("placeholder", /.+/);
    const labelledBy = await control.getAttribute("id");
    await expect(page.locator(`label[for="${labelledBy}"]`)).toBeVisible();
  }

  await expect(page.locator("#checkout-phone")).toHaveAttribute("type", "tel");
  await expect(page.locator("#checkout-lastName")).not.toHaveAttribute("required", "");
  await expect(page.getByPlaceholder("Discount code or gift card")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Apply", exact: true })).toHaveCount(0);
  await expect(page.getByText("Tracked delivery", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/UPS/i);
  await expect(page.locator("body")).not.toContainText(/express|expedited/i);
});

test("an empty required field shows an inline error", async ({ page }) => {
  await openCheckout(page);
  await page.getByRole("button", { name: "Continue to Secure Payment" }).click();

  const email = page.locator("#checkout-email");
  const emailError = page.locator("#checkout-email-error");
  await expect(emailError).toHaveText("This field is required.");
  await expect(email).toHaveAttribute("aria-describedby", "checkout-email-error");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#checkout-postalCode-error")).toHaveText("This field is required.");

  const alert = page.locator("#checkout-form-error");
  await expect(alert).toHaveAttribute("role", "alert");
  await expect(alert).toHaveAttribute("aria-live", "assertive");
  await expect(alert).toHaveText("Please check the highlighted fields.");
});

test("checkout inputs are at least 16px on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCheckout(page);
  const fontSize = await page.locator("#checkout-email").evaluate((element) => {
    return Number.parseFloat(getComputedStyle(element).fontSize);
  });
  expect(fontSize).toBeGreaterThanOrEqual(16);
  const postcodeSize = await page.locator("#checkout-postalCode").evaluate((element) => {
    return Number.parseFloat(getComputedStyle(element).fontSize);
  });
  expect(postcodeSize).toBeGreaterThanOrEqual(16);
});

test("the pay button stays disabled while checkout is pending", async ({ page }) => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/api\/checkout\/airwallex$/, async (route) => {
    await gate;
    await route.abort();
  });

  await openCheckout(page);
  await fillCheckout(page);
  const submit = page.getByRole("button", { name: "Continue to Secure Payment" });
  await expect(submit).toBeEnabled();
  await submit.click();

  const pending = page.getByRole("button", { name: "Processing…" });
  await expect(pending).toBeDisabled();
  const status = page.locator("#checkout-status");
  await expect(status).toHaveAttribute("role", "status");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toHaveText("Processing…");

  release();
  const alert = page.locator("#checkout-form-error");
  await expect(alert).toContainText("You have not been charged.");
  await expect(alert).not.toContainText("Failed to fetch");
  await expect(alert).not.toContainText("SDK");
  await expect(page.getByRole("button", { name: "Continue to Secure Payment" })).toBeEnabled();
});

test("server field errors land on the matching inputs", async ({ page }) => {
  await page.route(/\/api\/checkout\/airwallex$/, (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        errors: {
          postalCode: "Enter a valid postcode.",
          note: "Delivery note was too long.",
        },
      }),
    })
  );

  await openCheckout(page);
  await fillCheckout(page);
  await page.getByRole("button", { name: "Continue to Secure Payment" }).click();

  await expect(page.locator("#checkout-postalCode-error")).toHaveText("Enter a valid postcode.");
  await expect(page.locator("#checkout-postalCode")).toHaveAttribute(
    "aria-describedby",
    "checkout-postalCode-error"
  );
  await expect(page.locator("#checkout-form-error")).toHaveText("Delivery note was too long.");
  await expect(page).toHaveURL(/\/checkout$/);
});

test("a checkout failure shows the server message and reference", async ({ page }) => {
  await page.route(/\/api\/checkout\/cod$/, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Something went wrong. Please try again.",
        reference: "ab12cd34",
      }),
    })
  );

  await openCheckout(page);
  await fillCheckout(page);
  await page.getByText("Cash on Delivery", { exact: false }).first().click();
  await page.getByRole("button", { name: "Place Order" }).click();

  const alert = page.locator("#checkout-form-error");
  await expect(alert).toContainText("Something went wrong. Please try again.");
  await expect(alert).toContainText("Reference: ab12cd34");
  await expect(page).toHaveURL(/\/checkout$/);
});

test("the fields map from checkout validation lands on the postcode input", async ({ page }) => {
  await page.route(/\/api\/checkout\/airwallex$/, (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Check the highlighted fields.",
        fields: { postalCode: "Enter a valid postcode." },
      }),
    })
  );

  await openCheckout(page);
  await fillCheckout(page);
  await page.locator("#checkout-postalCode").fill("7870");
  await page.getByRole("button", { name: "Continue to Secure Payment" }).click();

  await expect(page.locator("#checkout-postalCode-error")).toHaveText("Enter a valid postcode.");
  await expect(page.locator("#checkout-form-error")).toContainText("Check the highlighted fields.");
});

test("Hong Kong submits with an empty postalCode", async ({ page }) => {
  const captured: { customer?: { country?: string; postalCode?: string } } = {};
  await page.route(/\/api\/checkout\/airwallex$/, async (route) => {
    captured.customer = route.request().postDataJSON().customer;
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Something went wrong. Please try again.",
        reference: "hk000001",
      }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await openCheckout(page);
  await page.getByRole("combobox", { name: "Country Required" }).selectOption("Hong Kong SAR");
  const postcode = page.locator("#checkout-postalCode");
  await expect(page.getByRole("textbox", { name: "Postcode (optional)", exact: true })).toBeVisible();
  await expect(postcode).toHaveAttribute("autocomplete", "postal-code");
  await expect(postcode).not.toHaveAttribute("required", "");

  await fillCheckout(page);
  await postcode.fill("");
  await page.screenshot({
    path: "test-results/checkout-hk-postcode-optional-390.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Continue to Secure Payment" }).click();

  await expect.poll(() => captured.customer?.country).toBe("Hong Kong SAR");
  expect(captured.customer?.postalCode).toBe("");
  await expect(page.locator("#checkout-postalCode-error")).toHaveCount(0);
});
