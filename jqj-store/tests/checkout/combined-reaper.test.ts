import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/checkout/airwallex/route";
import { createAirwallexPaymentIntent } from "@/lib/payments/airwallex";
import { releaseExpiredAirwallexReservations } from "@/lib/payments/airwallex-orders";
import {
  checkoutCustomer,
  checkoutItem,
  createCheckoutDb,
  dbError,
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

const KEY = "11111111-1111-4111-8111-111111111111";

function request() {
  return new Request("http://localhost:3000/api/checkout/airwallex", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [checkoutItem()],
      customer: checkoutCustomer,
      idempotencyKey: KEY,
    }),
  });
}

function intent() {
  return {
    id: "int_retry",
    request_id: KEY,
    status: "REQUIRES_PAYMENT_METHOD" as const,
    amount: 115,
    currency: "USD",
    client_secret: "secret_retry",
    merchant_order_id: "order",
  };
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function restores(db: MemoryDb) {
  return db.rpcCalls.filter((call) => call.fn === "restore_order_inventory");
}

describe("combined reservation reaper", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    vi.mocked(createAirwallexPaymentIntent).mockReset();
    vi.mocked(createAirwallexPaymentIntent).mockResolvedValue(intent());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("unexpected network call");
      })
    );
  });

  it("releases stock when a same-key retry fails without reserving again", async () => {
    // Mutation check: the catch used to restore only when this request had
    // reserved. Removing that release leaves stock at 4 and this test goes red.
    const first = await POST(request());
    expect(first.status).toBe(200);
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(db.rowsOf("orders")[0].inventory_reserved).toBe(true);
    expect(db.rpcCalls.filter((call) => call.fn === "reserve_order_inventory")).toHaveLength(1);

    vi.mocked(createAirwallexPaymentIntent).mockRejectedValueOnce(new Error("intent create failed"));
    const retry = await POST(request());

    expect(retry.status).toBe(500);
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(db.rowsOf("orders")).toHaveLength(1);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "failed",
      payment_status: "failed",
      inventory_reserved: false,
    });
    expect(restores(db)).toHaveLength(1);
  });

  it("leaves a held order for the reaper when the release throws", async () => {
    const first = await POST(request());
    expect(first.status).toBe(200);
    const orderId = (await first.json()).orderId as string;
    const original = db.rpc.bind(db);
    db.rpc = async (fn, args) => {
      if (fn === "restore_order_inventory") {
        return { data: null, error: dbError("driver-restore-secret", "XX000") };
      }
      return original(fn, args ?? {});
    };
    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args);
    });
    vi.mocked(createAirwallexPaymentIntent).mockRejectedValueOnce(new Error("intent create failed"));

    const retry = await POST(request());
    const body = await retry.json();
    spy.mockRestore();
    db.rpc = original;

    expect(retry.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("driver-restore-secret");
    expect(db.rowsOf("orders")[0]).toMatchObject({
      id: orderId,
      status: "pending",
      inventory_reserved: true,
    });
    expect(db.rowsOf("orders")[0].status).not.toBe("failed");
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(
      errors.some(
        (call) =>
          call[0] === "[airwallex-checkout] reservation release failed" &&
          JSON.stringify(call[1]).includes(orderId)
      )
    ).toBe(true);

    db.rowsOf("orders")[0].created_at = hoursAgo(2);
    await releaseExpiredAirwallexReservations(db as never);

    expect(db.rowsOf("orders")[0]).toMatchObject({
      inventory_reserved: false,
      status: "failed",
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(restores(db)).toHaveLength(1);
  });

  it("sweeps a failed reserved order once and does not sweep it again", async () => {
    db.rowsOf("products")[0].stock_count = 4;
    db.seed("orders", [
      {
        id: "order-failed",
        status: "failed",
        payment_provider: "airwallex",
        payment_status: "failed",
        fulfillment_status: "payment_failed",
        inventory_reserved: true,
        total_amount: 115,
        created_at: new Date().toISOString(),
      },
    ]);
    db.seed("order_items", [
      {
        id: "item-failed",
        order_id: "order-failed",
        product_id: "prod-amethyst",
        variant_id: null,
        quantity: 1,
      },
    ]);

    await releaseExpiredAirwallexReservations(db as never);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "failed",
      inventory_reserved: false,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(5);

    await releaseExpiredAirwallexReservations(db as never);
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(restores(db)).toHaveLength(1);
  });

  it("does not restore a paid order", async () => {
    db.rowsOf("products")[0].stock_count = 4;
    db.seed("orders", [
      {
        id: "order-paid",
        status: "paid",
        payment_provider: "airwallex",
        payment_status: "succeeded",
        fulfillment_status: "paid",
        inventory_reserved: true,
        total_amount: 115,
        created_at: hoursAgo(3),
      },
    ]);
    db.seed("order_items", [
      {
        id: "item-paid",
        order_id: "order-paid",
        product_id: "prod-amethyst",
        variant_id: null,
        quantity: 1,
      },
    ]);

    await releaseExpiredAirwallexReservations(db as never);

    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
      inventory_reserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(restores(db)).toHaveLength(0);
  });

  it("restores once when two reaper runs overlap", async () => {
    db.rowsOf("products")[0].stock_count = 4;
    db.seed("orders", [
      {
        id: "order-race",
        status: "pending",
        payment_provider: "airwallex",
        payment_status: "requires_payment_method",
        fulfillment_status: "pending_payment",
        inventory_reserved: true,
        total_amount: 115,
        created_at: hoursAgo(2),
      },
    ]);
    db.seed("order_items", [
      {
        id: "item-race",
        order_id: "order-race",
        product_id: "prod-amethyst",
        variant_id: null,
        quantity: 1,
      },
    ]);

    await Promise.all([
      releaseExpiredAirwallexReservations(db as never),
      releaseExpiredAirwallexReservations(db as never),
    ]);

    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(db.rowsOf("orders")[0].inventory_reserved).toBe(false);
    expect(restores(db)).toHaveLength(1);
  });
});
