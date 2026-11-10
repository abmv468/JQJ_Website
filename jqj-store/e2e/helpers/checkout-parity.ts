import { expect, type Page, type TestInfo } from "@playwright/test";
import { products } from "../../data/products";
import {
  checkoutExpectations,
  codFeeDisplay,
  quoteCheckout,
  toCents,
  type CheckoutMethod,
} from "./checkout-expectations";

export const CART_KEY = "JQD-cart";
export const MOBILE_PROJECT = "mobile-chromium";

type CheckoutRequest = {
  currency?: string;
  idempotencyKey?: string;
  shipping?: number;
  items?: { slug?: string; quantity?: number; price?: number }[];
};

type Quote = ReturnType<typeof quoteCheckout>;

type ServerPricing = {
  amount: number;
  subtotal: number;
  shipping: number;
  codFee: number;
};

const DEFAULT_APP_ORIGIN = "http://127.0.0.1:3000";

/**
 * Allow only the app origin, plus data: and blob: URLs. Anything else is
 * aborted, including Supabase and Airwallex. Registered first so later
 * page.route stubs (availability, checkout create/verify) still win.
 */
function isAllowedBrowserUrl(url: string, appOrigin: string) {
  if (url.startsWith("data:") || url.startsWith("blob:")) return true;
  try {
    return new URL(url).origin === appOrigin;
  } catch {
    return false;
  }
}

/**
 * The browser never leaves the app origin. Checkout create/verify routes are
 * stubbed per test, after this allowlist, so no order is inserted and no
 * stock is reserved.
 */
export async function installCheckoutIsolation(page: Page, baseURL?: string) {
  const appOrigin = new URL(baseURL ?? DEFAULT_APP_ORIGIN).origin;
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

  await page.route("**/*", (route) => {
    if (isAllowedBrowserUrl(route.request().url(), appOrigin)) return route.continue();
    // blockedbyclient is distinct from a network failure (net::ERR_FAILED).
    return route.abort("blockedbyclient");
  });

  await page.route(/\/api\/products\/availability$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ errors: [] }),
    })
  );
}

export function catalogUnitPrice(slug: string): number {
  const product = products.find((entry) => entry.slug === slug);
  if (!product) throw new Error(`No catalog product for slug ${slug}`);
  return product.price;
}

export function parseUsd(text: string): number {
  const normalized = text.replace(/,/g, "").replace(/\u00a0/g, " ");
  const amounts = [...normalized.matchAll(/\$\s*(\d+\.\d{2})/g)];
  if (amounts.length > 0) return Number(amounts[amounts.length - 1][1]);
  if (/\bFree\b/.test(normalized)) return 0;
  throw new Error(`No USD amount in ${JSON.stringify(text)}`);
}

export async function fillCheckout(page: Page) {
  await page.getByPlaceholder("Email", { exact: true }).fill("buyer@example.com");
  await page.getByPlaceholder("First name", { exact: true }).fill("Ada");
  await page.getByPlaceholder("Address", { exact: true }).fill("1 Atelier Lane");
  await page.getByPlaceholder("City", { exact: true }).fill("Austin");
}

export async function addProductToCart(page: Page, slug: string) {
  await page.goto(`/products/${slug}`);
  await page.getByRole("button", { name: "Add to Cart", exact: true }).click();
  await page.waitForFunction((key) => {
    const raw = localStorage.getItem(key);
    return Boolean(raw && JSON.parse(raw).length > 0);
  }, CART_KEY);
}

function summaryRow(page: Page, label: string) {
  // The cart drawer is a second <aside> with its own Subtotal. Checkout totals
  // are the summary inside <main>.
  return page.locator("main aside div.flex").filter({
    has: page.getByText(label, { exact: true }),
  });
}

async function readRowAmount(page: Page, label: string): Promise<number> {
  const row = summaryRow(page, label);
  await expect(row).toHaveCount(1);
  return parseUsd(await row.innerText());
}

export async function assertCodFeePresented(page: Page) {
  const option = page.locator("label").filter({ hasText: "Cash on Delivery" });
  await expect(option).toContainText(codFeeDisplay());
  const feeRow = summaryRow(page, "Cash on Delivery fee");
  if (toCents(checkoutExpectations.codFeeUsd) === 0) {
    await expect(feeRow).toHaveCount(0);
    return;
  }
  await expect(feeRow).toHaveCount(1);
  await expect(feeRow).toContainText(codFeeDisplay());
}

export async function readCheckoutTotals(page: Page, method: CheckoutMethod) {
  const subtotal = await readRowAmount(page, "Subtotal");
  const shipping = await readRowAmount(page, "Shipping");
  let codFee = 0;
  if (method === "cod") {
    await assertCodFeePresented(page);
    if (toCents(checkoutExpectations.codFeeUsd) !== 0) {
      codFee = await readRowAmount(page, "Cash on Delivery fee");
    }
  } else {
    await expect(summaryRow(page, "Cash on Delivery fee")).toHaveCount(0);
  }
  const total = await readRowAmount(page, "Total");
  return { subtotal, shipping, codFee, total };
}

/**
 * The pay/submit control is fully inside the viewport and has not been
 * scrolled past (its top is at or below the viewport top). WEB-011 points
 * this at the sticky mobile control; the stepped flow is not on main yet.
 */
export async function assertPayControlInView(page: Page, name: string) {
  const control = page.getByRole("button", { name, exact: true });
  await expect(control).toBeVisible();
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeInViewport({ ratio: 1 });
  const box = await control.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) {
    throw new Error("Pay control is not in the layout viewport");
  }
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.5);
}

function quoteFromRequest(body: CheckoutRequest, method: CheckoutMethod): Quote {
  const items = body.items ?? [];
  if (items.length === 0) throw new Error("Checkout request has no items");
  return quoteCheckout(
    items.map((item) => {
      if (!item.slug || !item.quantity) {
        throw new Error("Checkout item is missing a slug or quantity");
      }
      return {
        unitPriceUsd: catalogUnitPrice(item.slug),
        quantity: item.quantity,
      };
    }),
    method
  );
}

function checkoutPath(method: CheckoutMethod) {
  return method === "cod" ? "/api/checkout/cod" : "/api/checkout/airwallex";
}

export function waitForCheckoutResponse(page: Page, method: CheckoutMethod) {
  const path = checkoutPath(method);
  return page.waitForResponse((response) => {
    if (response.request().method() !== "POST") return false;
    return new URL(response.url()).pathname === path;
  });
}

export async function stubAirwallexVerify(page: Page, orderId: string) {
  await page.route(/\/api\/checkout\/airwallex\/verify$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        orderId,
        paymentStatus: "succeeded",
        succeeded: true,
        failed: false,
        pending: false,
        inventoryReserved: true,
      }),
    })
  );
}

/**
 * Fulfill the checkout create call without letting Next insert an order.
 * The amount is catalog price plus the expectations module, not the UI text
 * and not the shipping figure the browser sent.
 */
export async function stubCheckoutCreate(page: Page, method: CheckoutMethod, orderId: string) {
  const captured: {
    request: CheckoutRequest | null;
    quote: Quote | null;
    response: ServerPricing | null;
  } = {
    request: null,
    quote: null,
    response: null,
  };

  await page.route(new RegExp(`${checkoutPath(method)}$`), async (route) => {
    const request = route.request().postDataJSON() as CheckoutRequest;
    captured.request = request;
    const quote = quoteFromRequest(request, method);
    captured.quote = quote;
    const pricing: ServerPricing = {
      amount: quote.total,
      subtotal: quote.subtotal,
      shipping: quote.shipping,
      codFee: quote.codFee,
    };
    captured.response = pricing;
    const body =
      method === "cod"
        ? { orderId, ...pricing }
        : {
            orderId,
            intentId: "int_e2e",
            clientSecret: "secret_e2e",
            currency: "USD",
            sdkEnv: "demo",
            countryCode: "US",
            ...pricing,
          };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  return captured;
}

export function assertServerMatchesUi(
  ui: { subtotal: number; shipping: number; codFee: number; total: number },
  server: ServerPricing
) {
  expect(toCents(ui.subtotal) + toCents(ui.shipping) + toCents(ui.codFee)).toBe(toCents(ui.total));
  expect(toCents(server.subtotal), "server subtotal").toBe(toCents(ui.subtotal));
  expect(toCents(server.shipping), "server shipping").toBe(toCents(ui.shipping));
  expect(toCents(server.codFee), "server COD fee").toBe(toCents(ui.codFee));
  expect(toCents(server.amount), "server amount equals UI total").toBe(toCents(ui.total));
}

export async function submitAndAssertParity(
  page: Page,
  testInfo: TestInfo,
  method: CheckoutMethod,
  orderId: string
) {
  const captured = await stubCheckoutCreate(page, method, orderId);
  if (method === "airwallex") await stubAirwallexVerify(page, orderId);

  if (method === "cod") {
    await page.locator("label").filter({ hasText: "Cash on Delivery" }).click();
  }

  const ui = await readCheckoutTotals(page, method);
  const buttonName = method === "cod" ? "Place Order" : "Continue to Secure Payment";
  if (testInfo.project.name === MOBILE_PROJECT) {
    await assertPayControlInView(page, buttonName);
  }

  const responsePromise = waitForCheckoutResponse(page, method);
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  expect(new URL(response.url()).pathname).toBe(checkoutPath(method));

  // The success redirect drops the body before response.json() can read it.
  // The route recorded the exact payload it fulfilled; waitForResponse proves
  // the browser received that 200.
  if (!captured.response || !captured.request || !captured.quote) {
    throw new Error("Checkout route did not capture the create call");
  }
  const payload = captured.response;
  const request = captured.request;
  expect(response.request().postDataJSON()).toEqual(request);

  const catalogQuote = quoteFromRequest(request, method);
  expect(toCents(payload.amount), "response amount").toBe(toCents(catalogQuote.total));
  expect(toCents(payload.subtotal)).toBe(toCents(catalogQuote.subtotal));
  expect(toCents(payload.shipping)).toBe(toCents(catalogQuote.shipping));
  expect(toCents(payload.codFee)).toBe(toCents(catalogQuote.codFee));
  expect(toCents(captured.quote.total)).toBe(toCents(catalogQuote.total));
  assertServerMatchesUi(ui, payload);

  return { ui, payload, request, quote: captured.quote };
}

/**
 * What `/order-confirmation` shows today after a stubbed success.
 * BE-012/WEB-012 extend this with the signed order: items, total, ship-to,
 * short order number, and what's next. Those fields are not on the page yet.
 */
export async function assertCurrentConfirmation(
  page: Page,
  orderId: string,
  method: CheckoutMethod
) {
  await expect(page.getByRole("heading", { name: "Thank you for your order" })).toBeVisible();
  await expect(
    page.getByText(
      method === "cod"
        ? "Your Cash on Delivery order has been placed."
        : "Your Airwallex payment was successful."
    )
  ).toBeVisible();
  await expect(page.getByText("Order reference:")).toBeVisible();
  await expect(page.getByText(orderId, { exact: true })).toBeVisible();
  await expect(page.getByText("A confirmation email is on its way to your inbox.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue Shopping" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View Orders" })).toBeVisible();
}

export async function expectCartCleared(page: Page) {
  await page.waitForFunction((key) => {
    const raw = localStorage.getItem(key);
    return !raw || JSON.parse(raw).length === 0;
  }, CART_KEY);
}
