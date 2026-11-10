import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CheckoutPage from "@/app/(store)/checkout/page";
import { POST as postAirwallex } from "@/app/api/checkout/airwallex/route";
import { POST as postCod } from "@/app/api/checkout/cod/route";
import { COD_FEE, CARD_CURRENCY_NOTICE, COD_FREE_LABEL } from "@/lib/checkout-fees";
import { convertUsdToCurrency, type SupportedCurrency } from "@/lib/currency";
import {
  buildCheckoutSummary,
  type CheckoutSummary,
} from "@/lib/checkout-currency";
import { createAirwallexPaymentIntent } from "@/lib/payments/airwallex";
import { SHIPPING_FLAT_USD, computeShippingUsd } from "@/lib/shipping";
import { formatPrice } from "@/lib/utils";
import {
  checkoutCustomer,
  checkoutItem,
  createCheckoutDb,
  setActiveDb,
  type MemoryDb,
} from "../helpers/memory-db";

vi.mock("@/lib/payments/airwallex", async () => {
  const actual = await vi.importActual<typeof import("@/lib/payments/airwallex")>(
    "@/lib/payments/airwallex"
  );
  return {
    ...actual,
    createAirwallexPaymentIntent: vi.fn(),
    retrieveAirwallexPaymentIntent: vi.fn(),
  };
});

vi.mock("next/image", () => ({
  default: () => null,
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children?: unknown }) => children ?? null,
}));

const displayCurrency = vi.hoisted(() => ({ value: "EUR" }));

vi.mock("@/context/CurrencyContext", () => ({
  useCurrency: () => ({
    currency: displayCurrency.value,
    formatFromUsd: (amountUsd: number) =>
      `DISPLAY:${displayCurrency.value}:${amountUsd}`,
  }),
}));

const cartState = vi.hoisted(() => ({
  items: [
    {
      id: "prod-amethyst",
      slug: "amethyst-bracelet-xv",
      name: "Amethyst Bracelet XV (5mm)",
      price: 100,
      image: "/products/amethyst.jpg",
      quantity: 2,
    },
  ],
}));

vi.mock("@/context/CartContext", () => ({
  useCart: () => ({
    items: cartState.items,
    subtotal: cartState.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    clearCart: () => undefined,
  }),
}));

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const DB_UNIT_USD = 100;
const QTY = 2;
const SHIPPING_USD = 15;
const COD_FEE_USD = 20;
const CLIENT_PRICE = 1;

function moneyStrings(summary: CheckoutSummary) {
  return [
    ...summary.lines.map((line) => line.formatted),
    summary.subtotal,
    summary.shipping,
    summary.codFee,
    summary.total,
  ];
}

function expectEntirelyUsd(summary: CheckoutSummary, display: SupportedCurrency) {
  expect(summary.currency).toBe("USD");
  expect(summary.lines[0]?.formatted).toBe(formatPrice(summary.lines[0]?.amountUsd ?? 0, { currency: "USD" }));
  expect(summary.subtotal).toBe(formatPrice(summary.subtotalUsd, { currency: "USD" }));
  expect(summary.shipping).toBe(formatPrice(summary.shippingUsd, { currency: "USD" }));
  expect(summary.codFee).toBe(formatPrice(summary.codFeeUsd, { currency: "USD" }));
  expect(summary.total).toBe(formatPrice(summary.totalUsd, { currency: "USD" }));

  for (const formatted of moneyStrings(summary)) {
    expect(formatted).toBe(
      formatPrice(
        Number(formatted.replace(/[^0-9.]/g, "")),
        { currency: "USD" }
      )
    );
    if (display !== "USD") {
      const amount = Number(formatted.replace(/[^0-9.]/g, ""));
      expect(formatted).not.toBe(
        formatPrice(convertUsdToCurrency(amount, display), { currency: display })
      );
    }
  }
}

function summaryFromPrices(
  display: SupportedCurrency,
  codFeeUsd: number,
  unitPriceUsd: number,
  quantity: number
) {
  const items = [
    {
      name: "Amethyst Bracelet XV (5mm)",
      unitPriceUsd,
      quantity,
    },
  ];
  return buildCheckoutSummary({
    items,
    shippingUsd: computeShippingUsd(items),
    codFeeUsd,
    displayCurrency: display,
  });
}

function summaryFromDb(display: SupportedCurrency, codFeeUsd: number) {
  return summaryFromPrices(display, codFeeUsd, DB_UNIT_USD, QTY);
}

describe("checkout summary charge currency", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    displayCurrency.value = "EUR";
    cartState.items[0].price = DB_UNIT_USD;
    cartState.items[0].quantity = QTY;
    delete process.env.RESEND_API_KEY;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("unexpected network call");
      })
    );
    vi.mocked(createAirwallexPaymentIntent).mockReset();
    vi.mocked(createAirwallexPaymentIntent).mockResolvedValue({
      id: "int_test",
      request_id: REQUEST_ID,
      status: "REQUIRES_PAYMENT_METHOD",
      amount: 215,
      currency: "USD",
      client_secret: "secret_test",
      merchant_order_id: "order",
    });
  });

  it("shows every EUR-display line in USD and matches the Airwallex charge", async () => {
    const summary = summaryFromDb("EUR", 0);
    const response = await postAirwallex(
      new Request("http://localhost:3000/api/checkout/airwallex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [checkoutItem({ price: CLIENT_PRICE, quantity: QTY })],
          customer: checkoutCustomer,
          currency: "USD",
          idempotencyKey: REQUEST_ID,
        }),
      })
    );

    expect(response.status).toBe(200);
    const order = db.rowsOf("orders")[0];
    expect(summary.subtotalUsd).toBe(order.subtotal_amount);
    expect(summary.shippingUsd).toBe(order.shipping_amount);
    expect(summary.totalUsd).toBe(order.total_amount);
    expect(summary.totalUsd).not.toBe(CLIENT_PRICE * QTY + SHIPPING_USD);
    expect(db.rowsOf("order_items")[0].price_at_purchase).toBe(DB_UNIT_USD);
    expect(createAirwallexPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ amount: summary.totalUsd, currency: "USD" })
    );
    expectEntirelyUsd(summary, "EUR");
    expect(summary.chargeNote).toBe("Charged in USD");
    expect(summary.lines.map((line) => line.formatted)).toEqual([formatPrice(200, { currency: "USD" })]);
    expect(summary.subtotal).toBe(formatPrice(200, { currency: "USD" }));
    expect(summary.shipping).toBe(formatPrice(15, { currency: "USD" }));
    expect(summary.total).toBe(formatPrice(215, { currency: "USD" }));
  });

  it("shows every GBP-display line in USD and matches the COD order total", async () => {
    const summary = summaryFromDb("GBP", COD_FEE);
    const response = await postCod(
      new Request("http://localhost:3000/api/checkout/cod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [checkoutItem({ price: CLIENT_PRICE, quantity: QTY })],
          customer: checkoutCustomer,
          currency: "GBP",
          idempotencyKey: "cod-gbp-summary",
        }),
      })
    );

    expect(response.status).toBe(200);
    const order = db.rowsOf("orders")[0];
    expect(summary.subtotalUsd).toBe(order.subtotal_amount);
    expect(summary.shippingUsd).toBe(order.shipping_amount);
    expect(summary.codFeeUsd).toBe(COD_FEE);
    expect(summary.totalUsd).toBe(order.total_amount);
    expect(summary.totalUsd).not.toBe(CLIENT_PRICE * QTY + SHIPPING_USD + COD_FEE);
    expect(order.shipping_address).toEqual(expect.objectContaining({ cod_fee: COD_FEE }));
    expectEntirelyUsd(summary, "GBP");
    expect(summary.chargeNote).toBe("Charged in USD");
    expect(summary.codFee).toBe(formatPrice(COD_FEE, { currency: "USD" }));
    expect(summary.total).toBe(formatPrice(215, { currency: "USD" }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("leaves a USD display unchanged and omits the charge note", () => {
    const summary = summaryFromDb("USD", COD_FEE_USD);
    expectEntirelyUsd(summary, "USD");
    expect(summary.chargeNote).toBeNull();
    expect(summary.lines[0]?.formatted).toBe(
      formatPrice(convertUsdToCurrency(200, "USD"), { currency: "USD" })
    );
    expect(summary.total).toBe(formatPrice(235, { currency: "USD" }));
    expect(summary.codFee).toBe("$20.00");
  });

  it("does not mix a display-currency line item with a USD total", () => {
    const summary = summaryFromDb("EUR", COD_FEE_USD);
    const legacyLine = formatPrice(convertUsdToCurrency(200, "EUR"), { currency: "EUR" });
    const legacyCodFee = formatPrice(convertUsdToCurrency(20, "EUR"), { currency: "EUR" });
    const chargedTotal = formatPrice(235, { currency: "USD" });

    expect(legacyLine).not.toBe(formatPrice(200, { currency: "USD" }));
    expect(summary.lines[0]?.formatted).toBe(formatPrice(200, { currency: "USD" }));
    expect(summary.lines[0]?.formatted).not.toBe(legacyLine);
    expect(summary.subtotal).not.toBe(legacyLine);
    expect(summary.shipping).not.toBe(formatPrice(convertUsdToCurrency(15, "EUR"), { currency: "EUR" }));
    expect(summary.codFee).not.toBe(legacyCodFee);
    expect(summary.total).toBe(chargedTotal);
    expect(new Set(moneyStrings(summary).map((value) => value.replace(/[0-9.,\s]/g, ""))).size).toBe(1);
  });

  it("renders the card summary in USD when the shopper's display currency is EUR or GBP", () => {
    for (const currency of ["EUR", "GBP"] as const) {
      displayCurrency.value = currency;
      const html = renderToStaticMarkup(createElement(CheckoutPage));
      const legacyLine = `DISPLAY:${currency}:${DB_UNIT_USD * QTY}`;

      expect(html).toContain(formatPrice(200, { currency: "USD" }));
      expect(html).toContain(formatPrice(15, { currency: "USD" }));
      expect(html).toContain(formatPrice(215, { currency: "USD" }));
      expect(html).toContain("Charged in USD");
      expect(html).not.toContain(legacyLine);
      expect(html).not.toContain(formatPrice(convertUsdToCurrency(200, currency), { currency }));
      expect(html).toContain(CARD_CURRENCY_NOTICE);
      expect(html).toContain(COD_FREE_LABEL);
      expect(html).not.toContain("sandbox");
      expect(html).not.toContain("Cash on Delivery (+$0.00 fee)");
      expect(html).not.toContain(">Cash on Delivery fee<");
    }
  });

  it("renders a USD display without the charge note", () => {
    displayCurrency.value = "USD";
    const html = renderToStaticMarkup(createElement(CheckoutPage));
    expect(html).toContain(formatPrice(215, { currency: "USD" }));
    expect(html).not.toContain("Charged in USD");
    expect(html).not.toContain("DISPLAY:");
  });

  it.each([
    { usd: 200, shipping: SHIPPING_FLAT_USD },
    { usd: 249.99, shipping: SHIPPING_FLAT_USD },
    { usd: 250, shipping: 0 },
    { usd: 300, shipping: 0 },
  ])(
    "a USD merchandise total of $usd shows $shipping shipping and matches Airwallex",
    async ({ usd, shipping }) => {
      db.rowsOf("products")[0].price = usd;
      const summary = summaryFromPrices("EUR", 0, usd, 1);
      const response = await postAirwallex(
        new Request("http://localhost:3000/api/checkout/airwallex", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [checkoutItem({ price: CLIENT_PRICE, quantity: 1 })],
            customer: checkoutCustomer,
            currency: "USD",
            idempotencyKey: "22222222-2222-4222-8222-222222222222",
          }),
        })
      );

      expect(response.status).toBe(200);
      const order = db.rowsOf("orders")[0];
      expect(summary.subtotalUsd).toBe(usd);
      expect(summary.shippingUsd).toBe(shipping);
      expect(summary.shippingUsd).toBe(order.shipping_amount);
      expect(summary.totalUsd).toBe(usd + shipping);
      expect(summary.totalUsd).toBe(order.total_amount);
      expect(summary.shipping).toBe(formatPrice(shipping, { currency: "USD" }));
      expect(summary.total).toBe(formatPrice(usd + shipping, { currency: "USD" }));
      expect(createAirwallexPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({ amount: summary.totalUsd, currency: "USD" })
      );
      expectEntirelyUsd(summary, "EUR");
    }
  );

  it("renders flat USD shipping under $250 and free USD shipping at and above $250", () => {
    displayCurrency.value = "EUR";
    const cases = [
      { price: 200, shipping: SHIPPING_FLAT_USD },
      { price: 249.99, shipping: SHIPPING_FLAT_USD },
      { price: 250, shipping: 0 },
      { price: 300, shipping: 0 },
    ];
    for (const { price, shipping } of cases) {
      cartState.items[0].price = price;
      cartState.items[0].quantity = 1;
      const html = renderToStaticMarkup(createElement(CheckoutPage));
      expect(html).toContain(`Shipping</span><span>${formatPrice(shipping, { currency: "USD" })}</span>`);
      expect(html).toContain(formatPrice(price + shipping, { currency: "USD" }));
      expect(html).toContain("Charged in USD");
    }
  });
});
