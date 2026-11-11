import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postAirwallex } from "@/app/api/checkout/airwallex/route";
import { POST as postCod } from "@/app/api/checkout/cod/route";
import { products } from "@/data/products";
import { createAirwallexPaymentIntent } from "@/lib/payments/airwallex";
import { MemoryDb, checkoutCustomer, setActiveDb } from "../helpers/memory-db";
import {
  FREE_SHIPPING_THRESHOLD_USD,
  quoteCheckout,
  toCents,
  type CheckoutMethod,
} from "../shared/checkout-expectations";

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

const UNDER_SLUG = "blue-lace-agate-silver-pendant";
const OVER_SLUG = "amethyst-bracelet-xv";

function catalogProduct(slug: string) {
  const product = products.find((entry) => entry.slug === slug);
  if (!product) throw new Error(`No catalog product for ${slug}`);
  return product;
}

function seedCatalog() {
  const db = new MemoryDb();
  for (const slug of [UNDER_SLUG, OVER_SLUG]) {
    const product = catalogProduct(slug);
    db.seed("products", [
      {
        id: product.id,
        slug: product.slug,
        name: product.name,
        price: product.price,
        stock_count: 20,
        in_stock: true,
        low_stock_threshold: product.lowStockThreshold ?? 5,
        sku: product.sku ?? null,
      },
    ]);
  }
  return db;
}

function line(slug: string) {
  const product = catalogProduct(slug);
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    price: 1,
    quantity: 1,
  };
}

function request(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function expectCents(actual: unknown, expected: number, label: string) {
  expect(toCents(Number(actual)), label).toBe(toCents(expected));
}

describe("real checkout routes match quoteCheckout", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = seedCatalog();
    setActiveDb(db);
    delete process.env.RESEND_API_KEY;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("unexpected network call");
      })
    );
    vi.mocked(createAirwallexPaymentIntent).mockReset();
    vi.mocked(createAirwallexPaymentIntent).mockResolvedValue({
      id: "int_parity",
      request_id: "22222222-2222-4222-8222-222222222222",
      status: "REQUIRES_PAYMENT_METHOD",
      amount: 0,
      currency: "USD",
      client_secret: "secret_parity",
      merchant_order_id: "order",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function place(
    method: CheckoutMethod,
    slug: string,
    idempotencyKey: string
  ) {
    const product = catalogProduct(slug);
    const quote = quoteCheckout([{ unitPriceUsd: product.price, quantity: 1 }], method);
    const endpoint = method === "cod" ? postCod : postAirwallex;
    const response = await endpoint(
      request(`http://localhost:3000/api/checkout/${method === "cod" ? "cod" : "airwallex"}`, {
        items: [line(slug)],
        customer: checkoutCustomer,
        currency: "USD",
        shipping: quote.shipping + 50,
        idempotencyKey,
      })
    );
    expect(response.status).toBe(200);
    const order = db.rowsOf("orders")[0];
    expectCents(order.subtotal_amount, quote.subtotal, `${method} ${slug} subtotal`);
    expectCents(order.shipping_amount, quote.shipping, `${method} ${slug} shipping`);
    expectCents(order.total_amount, quote.total, `${method} ${slug} total`);
    return { quote, order };
  }

  it("charges shipping for the card cart under the free-shipping threshold", async () => {
    const product = catalogProduct(UNDER_SLUG);
    expect(toCents(product.price)).toBeLessThan(toCents(FREE_SHIPPING_THRESHOLD_USD));

    const { quote } = await place(
      "airwallex",
      UNDER_SLUG,
      "33333333-3333-4333-8333-333333333333"
    );
    expect(toCents(quote.shipping)).toBeGreaterThan(0);
    const intent = vi.mocked(createAirwallexPaymentIntent).mock.calls[0]?.[0];
    expect(intent, "Airwallex intent").toBeTruthy();
    expectCents(intent?.amount, quote.total, "Airwallex amount");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("waives shipping for the card cart at or above the free-shipping threshold", async () => {
    const product = catalogProduct(OVER_SLUG);
    expect(toCents(product.price)).toBeGreaterThanOrEqual(toCents(FREE_SHIPPING_THRESHOLD_USD));

    const { quote } = await place(
      "airwallex",
      OVER_SLUG,
      "44444444-4444-4444-8444-444444444444"
    );
    expect(toCents(quote.shipping)).toBe(0);
    const intent = vi.mocked(createAirwallexPaymentIntent).mock.calls[0]?.[0];
    expectCents(intent?.amount, quote.total, "Airwallex amount");
  });

  it("adds the configured COD fee on top of the same shipping rule", async () => {
    const { quote, order } = await place(
      "cod",
      OVER_SLUG,
      "55555555-5555-4555-8555-555555555555"
    );
    expect(toCents(quote.shipping)).toBe(0);
    const address = order.shipping_address as { cod_fee?: number };
    expect(address.cod_fee, "COD fee").toBe(quote.codFee);
    expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
