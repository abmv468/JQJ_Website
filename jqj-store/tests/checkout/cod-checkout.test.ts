import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/checkout/cod/route";
import { COD_FEE } from "@/lib/checkout-fees";
import {
  checkoutCustomer,
  checkoutItem,
  createCheckoutDb,
  dbError,
  setActiveDb,
  type MemoryDb,
} from "../helpers/memory-db";

const KEY = "cod-attempt-1";

function request(body: unknown) {
  return new Request("http://localhost:3000/api/checkout/cod", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/checkout/cod", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    delete process.env.RESEND_API_KEY;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("unexpected network call");
      })
    );
  });

  it("reserves stock, adds shipping, charges no COD fee, and does not email without a Resend key", async () => {
    const response = await POST(
      request({
        items: [checkoutItem({ price: 1, quantity: 2 })],
        customer: checkoutCustomer,
        currency: "USD",
        idempotencyKey: KEY,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.orderId).toEqual(expect.any(String));
    expect(db.rowsOf("products")[0].stock_count).toBe(3);
    const order = db.rowsOf("orders")[0];
    expect(COD_FEE).toBe(0);
    expect(order).toMatchObject({
      payment_provider: "cod",
      payment_status: "pending",
      status: "pending",
      inventory_reserved: true,
      subtotal_amount: 200,
      shipping_amount: 15,
      total_amount: 200 + 15 + COD_FEE,
      stripe_session_id: `COD-${KEY}`,
      shipping_address: expect.objectContaining({
        payment_method: "cod",
        cod_fee: 0,
      }),
    });
    expect(order.total_amount).toBe(order.subtotal_amount as number + (order.shipping_amount as number));
    expect(
      db.rowsOf("order_items").some((item) => /fee/i.test(String(item.product_name)))
    ).toBe(false);
    expect(db.rpcCalls.filter((call) => call.fn === "reserve_order_inventory")).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns the same order for a repeated idempotency key without reserving again", async () => {
    const payload = {
      items: [checkoutItem()],
      customer: checkoutCustomer,
      idempotencyKey: KEY,
    };
    const first = await POST(request(payload));
    const second = await POST(request(payload));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    expect(db.rowsOf("orders")).toHaveLength(1);
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(db.rpcCalls.filter((call) => call.fn === "reserve_order_inventory")).toHaveLength(1);
  });

  it("rejects an empty cart and short stock before creating an order", async () => {
    expect((await POST(request({ items: [], customer: checkoutCustomer }))).status).toBe(400);

    const response = await POST(
      request({ items: [checkoutItem({ quantity: 9 })], customer: checkoutCustomer })
    );
    expect(response.status).toBe(409);
    expect(db.rowsOf("orders")).toHaveLength(0);
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
  });

  it("restores stock and removes the order when line items cannot be saved", async () => {
    db.failWhen = (table, op) =>
      table === "order_items" && op === "insert" ? dbError("insert failed", "XX000") : null;

    const response = await POST(
      request({
        items: [checkoutItem()],
        customer: checkoutCustomer,
        idempotencyKey: KEY,
      })
    );

    expect(response.status).toBe(500);
    expect(db.rowsOf("orders")).toHaveLength(0);
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(db.rpcCalls.filter((call) => call.fn === "restore_order_inventory")).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});
