import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/checkout/cod/route";
import { normalizeCurrency } from "@/lib/currency";
import { sendOrderEmails } from "@/lib/email";
import {
  checkoutCustomer,
  checkoutItem,
  createCheckoutDb,
  setActiveDb,
  type MemoryDb,
} from "../helpers/memory-db";

vi.mock("@/lib/email", async () => {
  const actual = await vi.importActual<typeof import("@/lib/email")>("@/lib/email");
  return {
    ...actual,
    sendOrderEmails: vi.fn(actual.sendOrderEmails),
  };
});

function request(body: unknown) {
  return new Request("http://localhost:3000/api/checkout/cod", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("COD order currency", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    delete process.env.RESEND_API_KEY;
    delete process.env.ADMIN_EMAIL;
    vi.mocked(sendOrderEmails).mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("unexpected network call");
      })
    );
  });

  it.each(["EUR", "GBP", "HKD", "USD"])(
    "stores and emails USD when the shopper display currency is %s",
    async (displayCurrency) => {
      const response = await POST(
        request({
          items: [checkoutItem({ price: 1, quantity: 2 })],
          customer: checkoutCustomer,
          currency: displayCurrency,
          idempotencyKey: `cod-currency-${displayCurrency}`,
        })
      );

      expect(response.status).toBe(200);
      expect(db.rowsOf("orders")).toHaveLength(1);
      expect(db.rowsOf("orders")[0]).toMatchObject({
        currency: "USD",
        subtotal_amount: 200,
        shipping_amount: 15,
        total_amount: 235,
        shipping_address: expect.objectContaining({
          payment_method: "cod",
          cod_fee: 20,
          currency: normalizeCurrency(displayCurrency),
        }),
      });
      expect(sendOrderEmails).toHaveBeenCalledTimes(1);
      expect(sendOrderEmails).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: "USD",
          subtotal: 200,
          shipping: 15,
          codFee: 20,
          total: 235,
          paymentMethod: "cod",
        })
      );
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it("reuses one idempotency key when the same cart is submitted in EUR and then USD", async () => {
    const cart = {
      items: [checkoutItem()],
      customer: checkoutCustomer,
    };
    const eur = await POST(request({ ...cart, currency: "EUR" }));
    const usd = await POST(request({ ...cart, currency: "USD" }));

    expect(eur.status).toBe(200);
    expect(usd.status).toBe(200);
    expect(await usd.json()).toEqual(await eur.json());
    expect(db.rowsOf("orders")).toHaveLength(1);
    expect(db.rowsOf("orders")[0].stripe_session_id).toMatch(/^COD-[0-9a-f]{24}$/);
    expect(db.rpcCalls.filter((call) => call.fn === "reserve_order_inventory")).toHaveLength(1);
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
  });

  it("derives a different idempotency key for a different cart", async () => {
    const first = await POST(
      request({
        items: [checkoutItem({ quantity: 1 })],
        customer: checkoutCustomer,
        currency: "USD",
      })
    );
    const second = await POST(
      request({
        items: [checkoutItem({ quantity: 2 })],
        customer: checkoutCustomer,
        currency: "USD",
      })
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const orders = db.rowsOf("orders");
    expect(orders).toHaveLength(2);
    expect(orders[0].stripe_session_id).not.toBe(orders[1].stripe_session_id);
    expect(orders[0].stripe_session_id).toMatch(/^COD-[0-9a-f]{24}$/);
    expect(orders[1].stripe_session_id).toMatch(/^COD-[0-9a-f]{24}$/);
  });
});
