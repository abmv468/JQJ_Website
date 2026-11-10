import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postAirwallex } from "@/app/api/checkout/airwallex/route";
import { POST as postCod } from "@/app/api/checkout/cod/route";
import { POST as postQuote } from "@/app/api/checkout/quote/route";
import { createAirwallexPaymentIntent } from "@/lib/payments/airwallex";
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

function quoteRequest(body: unknown) {
  return new Request("http://localhost:3000/api/checkout/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/checkout/quote", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    delete process.env.RESEND_API_KEY;
    vi.mocked(createAirwallexPaymentIntent).mockReset();
    vi.mocked(createAirwallexPaymentIntent).mockResolvedValue({
      id: "int_quote",
      status: "REQUIRES_PAYMENT_METHOD",
      amount: 0,
      currency: "USD",
      client_secret: "secret_test",
    });
  });

  it("prices $249.99 from the database and charges shipping when the client price is stale", async () => {
    db.rowsOf("products")[0].price = 249.99;

    const response = await postQuote(
      quoteRequest({
        items: [checkoutItem({ price: 1, quantity: 1 })],
        discountCode: "HALF",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      subtotalUsd: 249.99,
      shippingUsd: 15,
      totalUsd: 264.99,
      lines: [
        {
          productId: "prod-amethyst",
          quantity: 1,
          unitPriceUsd: 249.99,
          lineTotalUsd: 249.99,
        },
      ],
    });
    expect(body.subtotalUsd).toBe(
      body.lines.reduce((sum: number, line: { lineTotalUsd: number }) => sum + line.lineTotalUsd, 0)
    );
    expect(body.lines[0].unitPriceUsd).toBe(249.99);
    expect(db.rowsOf("orders")).toHaveLength(0);
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(db.rpcCalls).toHaveLength(0);
    expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();
  });

  it("prices $250.00 from the product id and waives shipping", async () => {
    db.rowsOf("products")[0].price = 250;

    const response = await postQuote(
      quoteRequest({
        items: [checkoutItem({ id: "prod-amethyst", price: 1, quantity: 1 })],
        discountCode: "HALF",
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      subtotalUsd: 250,
      shippingUsd: 0,
      totalUsd: 250,
      lines: [
        {
          productId: "prod-amethyst",
          quantity: 1,
          unitPriceUsd: 250,
          lineTotalUsd: 250,
        },
      ],
    });
    expect(db.rowsOf("orders")).toHaveLength(0);
    expect(db.rpcCalls).toHaveLength(0);
  });

  it("prices a variant line from the database when the client price differs", async () => {
    db.rowsOf("products")[0].price = 80;
    db.seed("product_variants", [
      {
        id: "var-amethyst-s",
        product_id: "prod-amethyst",
        size: "S",
        material: "Gold",
        sku: "JQJ-AMETH-S",
        stock_count: 3,
      },
    ]);

    const response = await postQuote(
      quoteRequest({
        items: [
          checkoutItem({
            price: 1,
            quantity: 2,
            sku: "JQJ-AMETH-S",
            size: "S",
            material: "Gold",
          }),
        ],
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.lines).toEqual([
      {
        productId: "prod-amethyst",
        variantId: "var-amethyst-s",
        quantity: 2,
        unitPriceUsd: 80,
        lineTotalUsd: 160,
      },
    ]);
    expect(body.subtotalUsd).toBe(160);
    expect(body.shippingUsd).toBe(15);
    expect(body.totalUsd).toBe(175);
  });

  it("rejects an id-only item the same way cash on delivery does, without a database call for capped carts", async () => {
    const idOnly = {
      items: [{ id: "prod-amethyst", name: "Amethyst Bracelet XV (5mm)", price: 1, quantity: 1 }],
      customer: checkoutCustomer,
      currency: "USD",
      idempotencyKey: "cod-id-only",
    };
    const quote = await postQuote(quoteRequest(idOnly));
    const cod = await postCod(
      new Request("http://localhost:3000/api/checkout/cod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(idOnly),
      })
    );
    expect(quote.status).toBe(cod.status);
    expect(await quote.json()).toEqual(await cod.json());
    expect(db.rowsOf("orders")).toHaveLength(0);

    const from = vi.spyOn(db, "from");
    const tooMany = await postQuote(
      quoteRequest({ items: Array.from({ length: 51 }, () => checkoutItem()) })
    );
    expect(tooMany.status).toBe(400);
    expect(await tooMany.json()).toEqual({ error: "Your cart has too many items." });

    const tooLarge = await postQuote(
      quoteRequest({ items: [checkoutItem({ quantity: 100 })] })
    );
    const tooLargeBody = await tooLarge.json();
    expect(tooLarge.status).toBe(400);
    expect(tooLargeBody).toEqual({ error: "Enter a quantity from 1 to 99." });
    expect(tooLargeBody.fields).toBeUndefined();

    for (const quantity of ["5", [5]]) {
      const rejected = await postQuote(
        quoteRequest({ items: [checkoutItem({ quantity })] })
      );
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toEqual({ error: "Enter a quantity from 1 to 99." });
    }

    const badJson = await postQuote(
      new Request("http://localhost:3000/api/checkout/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      })
    );
    expect(badJson.status).toBe(400);
    expect(await badJson.json()).toEqual({ error: "Invalid request" });
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects an unknown item with 409 and does not write", async () => {
    const response = await postQuote(
      quoteRequest({ items: [{ id: "missing-product", quantity: 1, price: 250 }] })
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/unavailable/);
    expect(JSON.stringify(body)).not.toMatch(/UPS|Express|expedited/);
    expect(db.rowsOf("orders")).toHaveLength(0);
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(db.rpcCalls).toHaveLength(0);
    expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();
  });

  it("uses the same shipping amounts on Airwallex and COD", async () => {
    db.rowsOf("products")[0].price = 249.99;
    const under = await postAirwallex(
      new Request("http://localhost:3000/api/checkout/airwallex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [checkoutItem({ price: 1 })],
          customer: checkoutCustomer,
          currency: "USD",
          idempotencyKey: "33333333-3333-4333-8333-333333333333",
        }),
      })
    );
    expect(under.status).toBe(200);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      subtotal_amount: 249.99,
      shipping_amount: 15,
    });
    expect(createAirwallexPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 264.99 })
    );

    db.rowsOf("products")[0].price = 250;
    db.rowsOf("products")[0].stock_count = 5;
    const cod = await postCod(
      new Request("http://localhost:3000/api/checkout/cod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [checkoutItem({ price: 1 })],
          customer: checkoutCustomer,
          currency: "USD",
          idempotencyKey: "cod-quote-250",
        }),
      })
    );
    expect(cod.status).toBe(200);
    expect(db.rowsOf("orders").at(-1)).toMatchObject({
      subtotal_amount: 250,
      shipping_amount: 0,
      total_amount: 270,
    });
  });
});
