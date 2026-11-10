import { expect, test, type Page } from "@playwright/test";

const CART_KEY = "JQD-cart";

const walletOrCarrier =
  /apple pay|google pay|paypal|shop pay|worldwide|\bups\b|ups express/i;
const cardSchemes = /visa|mastercard|american express|amex|unionpay|jcb|discover|diners/i;

function cartItem(quantity: number) {
  return {
    id: "amethyst-xv",
    slug: "amethyst-bracelet-xv",
    name: "Amethyst Bracelet XV (5mm)",
    price: 330.99,
    image: "/products/amethyst-bracelet.webp",
    quantity,
  };
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

async function seedCart(page: Page, quantity = 2) {
  await page.addInitScript(
    ({ key, item }) => {
      localStorage.setItem(key, JSON.stringify([item]));
    },
    { key: CART_KEY, item: cartItem(quantity) }
  );
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
  await page.route(/\/api\/checkout(?:\/|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    })
  );
});

test("the cart drawer is a dialog, Escape closes it, and focus returns to the trigger", async ({
  page,
}) => {
  await seedCart(page, 1);
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Cart" });
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: /Cart/ });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");

  await page.keyboard.press("Tab");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const openDialog = document.querySelector("[role='dialog']");
        return Boolean(openDialog && openDialog.contains(document.activeElement));
      })
    )
    .toBe(true);

  const decrease = dialog.getByRole("button", { name: "Decrease quantity of Amethyst Bracelet XV (5mm)" });
  const box = await decrease.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("checkout line quantity is fully visible", async ({ page }) => {
  await seedCart(page, 2);
  await page.goto("/checkout");
  const quantity = page.getByTestId("line-quantity");
  await expect(quantity).toBeVisible();
  await expect(quantity).toHaveText("2");
  const clipped = await quantity.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 16 || rect.height < 16) return true;
    let node = el.parentElement;
    while (node) {
      const style = getComputedStyle(node);
      const clips = [style.overflow, style.overflowX, style.overflowY].some(
        (value) => value === "hidden" || value === "clip"
      );
      if (clips) {
        const parent = node.getBoundingClientRect();
        const slop = 0.5;
        if (
          rect.left < parent.left - slop ||
          rect.top < parent.top - slop ||
          rect.right > parent.right + slop ||
          rect.bottom > parent.bottom + slop
        ) {
          return true;
        }
      }
      node = node.parentElement;
    }
    return false;
  });
  expect(clipped).toBe(false);
});

test("Checkout is disabled while stock is checked", async ({ page }) => {
  await page.route(/\/api\/products\/availability$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ errors: [] }),
    });
  });
  await seedCart(page, 1);
  await page.goto("/cart");
  const checkout = page.getByRole("button", { name: "Checkout" });
  await expect(checkout).toBeDisabled();
  await expect(checkout).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("aside").getByRole("status")).toHaveText("Checking stock…");
  await expect(checkout).toBeEnabled();
  await expect(checkout).toHaveAttribute("aria-busy", "false");
});

test("the trust strip names enabled methods and no card schemes or wallets", async ({ page }) => {
  await seedCart(page, 1);
  await page.goto("/cart");
  const strip = page
    .locator("aside")
    .filter({ has: page.getByRole("heading", { name: "Order Summary" }) })
    .getByTestId("checkout-trust-strip");
  await expect(strip).toBeVisible();
  await expect(strip).toContainText("Secure checkout");
  await expect(strip).toContainText("Cash on delivery");
  await expect(strip.getByTestId("checkout-scheme-row")).toHaveCount(0);
  await expect(strip).not.toContainText(cardSchemes);
  await expect(strip).not.toContainText(/apple pay|google pay|paypal|shop pay/i);

  await page.getByRole("button", { name: "Cart" }).click();
  const drawerStrip = page.getByRole("dialog").getByTestId("checkout-trust-strip");
  await expect(drawerStrip).toBeVisible();
  await expect(drawerStrip.getByTestId("checkout-scheme-row")).toHaveCount(0);
  const text = await drawerStrip.innerText();
  expect(text).not.toMatch(cardSchemes);
  expect(text).not.toMatch(walletOrCarrier);
  expect(text).not.toMatch(/\d+\s*(?:–|-|to)\s*\d+\s*(?:business\s+)?days/i);
});

test.describe("mobile cart", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the sticky checkout bar is visible", async ({ page }) => {
    await seedCart(page, 1);
    await page.goto("/cart");
    const bar = page.getByTestId("cart-sticky-checkout");
    await expect(bar).toBeVisible();
    await expect(bar.getByText("Subtotal")).toBeVisible();
    await expect(bar.getByRole("button", { name: "Checkout" })).toBeVisible();
    const box = await bar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeGreaterThan(700);
    expect(box!.y).toBeLessThan(844);
    await expect(bar.getByTestId("checkout-trust-strip")).not.toContainText(cardSchemes);
    await expect(bar.getByTestId("checkout-trust-strip")).not.toContainText(
      /apple pay|google pay|paypal|shop pay/i
    );
  });
});
