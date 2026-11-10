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

  it("does not release stock when a same-key retry fails without reserving again", async () => {
    const first = await POST(request());
    expect(first.status).toBe(200);
    const held = {
      status: db.rowsOf("orders")[0].status,
      payment_status: db.rowsOf("orders")[0].payment_status,
      fulfillment_status: db.rowsOf("orders")[0].fulfillment_status,
      inventory_reserved: db.rowsOf("orders")[0].inventory_reserved,
    };
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(held.inventory_reserved).toBe(true);

    vi.mocked(createAirwallexPaymentIntent).mockRejectedValueOnce(new Error("intent create failed"));
    const retry = await POST(request());

    expect(retry.status).toBe(500);
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(db.rowsOf("orders")).toHaveLength(1);
    expect(db.rowsOf("orders")[0]).toMatchObject(held);
    expect(restores(db)).toHaveLength(0);
  });

  it("leaves a fresh reservation for the reaper when the release throws", async () => {
    const original = db.rpc.bind(db);
    db.rpc = async (fn, args) => {
      if (fn === "restore_order_inventory") {
        return { data: null, error: { message: "driver-restore-secret", code: "XX000" } };
      }
      return original(fn, args ?? {});
    };
    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args);
    });
    vi.mocked(createAirwallexPaymentIntent).mockRejectedValueOnce(new Error("intent create failed"));

    const response = await POST(request());
    const body = await response.json();
    spy.mockRestore();
    db.rpc = original;

    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("driver-restore-secret");
    const orderId = String(db.rowsOf("orders")[0].id);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "failed",
      payment_status: "failed",
      inventory_reserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(
      errors.some(
        (call) =>
          call[0] === "[airwallex-checkout] reservation release failed" &&
          JSON.stringify(call[1]).includes(orderId)
      )
    ).toBe(true);

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

  it("releases the oldest pending and failed holds without letting one bucket take the whole run", async () => {
    const orders = [];
    const items = [];
    for (const kind of ["pending", "failed"] as const) {
      for (let i = 29; i >= 0; i -= 1) {
        const id = `${kind}-${i}`;
        orders.push({
          id,
          status: kind === "pending" ? "pending" : "failed",
          payment_provider: "airwallex",
          payment_status: kind === "pending" ? "requires_payment_method" : "failed",
          fulfillment_status: kind === "pending" ? "pending_payment" : "payment_failed",
          inventory_reserved: true,
          total_amount: 115,
          created_at: hoursAgo(40 - i),
        });
        items.push({
          id: `item-${id}`,
          order_id: id,
          product_id: "prod-amethyst",
          variant_id: null,
          quantity: 1,
        });
      }
    }
    db.seed("orders", orders);
    db.seed("order_items", items);
    db.rowsOf("products")[0].stock_count = 0;

    await releaseExpiredAirwallexReservations(db as never);

    const reserved = (id: string) =>
      db.rowsOf("orders").find((row) => row.id === id)?.inventory_reserved === true;
    expect(reserved("pending-0")).toBe(false);
    expect(reserved("pending-24")).toBe(false);
    expect(reserved("pending-25")).toBe(true);
    expect(reserved("failed-0")).toBe(false);
    expect(reserved("failed-24")).toBe(false);
    expect(reserved("failed-25")).toBe(true);
    expect(db.rowsOf("orders").filter((row) => row.inventory_reserved === false)).toHaveLength(50);
  });

  it("continues the batch when one order throws and logs only that order id", async () => {
    const old = hoursAgo(3);
    db.seed("orders", [
      {
        id: "order-bad",
        status: "pending",
        payment_provider: "airwallex",
        payment_status: "requires_payment_method",
        fulfillment_status: "pending_payment",
        inventory_reserved: true,
        total_amount: 115,
        customer_email: "buyer@example.com",
        created_at: old,
      },
      {
        id: "order-ok",
        status: "pending",
        payment_provider: "airwallex",
        payment_status: "requires_payment_method",
        fulfillment_status: "pending_payment",
        inventory_reserved: true,
        total_amount: 115,
        created_at: hoursAgo(4),
      },
    ]);
    db.seed("order_items", [
      {
        id: "item-bad",
        order_id: "order-bad",
        product_id: "prod-amethyst",
        variant_id: null,
        quantity: 1,
      },
      {
        id: "item-ok",
        order_id: "order-ok",
        product_id: "prod-amethyst",
        variant_id: null,
        quantity: 1,
      },
    ]);
    db.rowsOf("products")[0].stock_count = 0;
    const original = db.rpc.bind(db);
    db.rpc = async (fn, args) => {
      if (fn === "restore_order_inventory" && args?.p_order_id === "order-bad") {
        return { data: null, error: { message: "driver-secret-xyz", code: "XX000" } };
      }
      return original(fn, args ?? {});
    };
    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args);
    });

    await releaseExpiredAirwallexReservations(db as never);
    spy.mockRestore();

    expect(db.rowsOf("orders").find((row) => row.id === "order-ok")?.inventory_reserved).toBe(false);
    expect(db.rowsOf("orders").find((row) => row.id === "order-bad")?.inventory_reserved).toBe(true);
    expect(db.rowsOf("products")[0].stock_count).toBe(1);
    const logged = errors.filter((call) => call[0] === "[reservation-release]");
    expect(logged).toEqual([["[reservation-release]", "order-bad"]]);
    expect(JSON.stringify(logged)).not.toContain("driver-secret-xyz");
    expect(JSON.stringify(logged)).not.toContain("buyer@example.com");
  });

  it("processes at most 50 orders when 60 pending and 60 failed holds are waiting", async () => {
    const old = hoursAgo(2);
    const orders = [];
    const items = [];
    for (let i = 0; i < 60; i += 1) {
      orders.push({
        id: `pending-${i}`,
        status: "pending",
        payment_provider: "airwallex",
        payment_status: "requires_payment_method",
        fulfillment_status: "pending_payment",
        inventory_reserved: true,
        total_amount: 115,
        created_at: old,
      });
      items.push({
        id: `item-pending-${i}`,
        order_id: `pending-${i}`,
        product_id: "prod-amethyst",
        variant_id: null,
        quantity: 1,
      });
    }
    for (let i = 0; i < 60; i += 1) {
      orders.push({
        id: `failed-${i}`,
        status: "failed",
        payment_provider: "airwallex",
        payment_status: "failed",
        fulfillment_status: "payment_failed",
        inventory_reserved: true,
        total_amount: 115,
        created_at: old,
      });
      items.push({
        id: `item-failed-${i}`,
        order_id: `failed-${i}`,
        product_id: "prod-amethyst",
        variant_id: null,
        quantity: 1,
      });
    }
    db.seed("orders", orders);
    db.seed("order_items", items);
    db.rowsOf("products")[0].stock_count = 0;

    await releaseExpiredAirwallexReservations(db as never);

    const released = db.rowsOf("orders").filter((row) => row.inventory_reserved === false);
    expect(released).toHaveLength(50);
    expect(db.rowsOf("orders").filter((row) => row.inventory_reserved === true)).toHaveLength(70);
    expect(restores(db)).toHaveLength(50);
    expect(db.rowsOf("products")[0].stock_count).toBe(50);
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
