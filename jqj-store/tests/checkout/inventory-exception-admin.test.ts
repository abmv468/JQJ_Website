import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST, PUT } from "@/app/api/admin/orders/route";
import { createAirwallexRefund } from "@/lib/payments/airwallex";
import { createCheckoutDb, dbError, setActiveDb, type MemoryDb } from "../helpers/memory-db";

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: async (token: string) => {
        if (token === "admin-token") {
          return { data: { user: { email: "admin@example.com" } }, error: null };
        }
        if (token === "shopper-token") {
          return { data: { user: { email: "shopper@example.com" } }, error: null };
        }
        return { data: { user: null }, error: { message: "invalid" } };
      },
    },
  }),
}));

vi.mock("@/lib/payments/airwallex", async () => {
  const actual = await vi.importActual<typeof import("@/lib/payments/airwallex")>(
    "@/lib/payments/airwallex"
  );
  return {
    ...actual,
    createAirwallexRefund: vi.fn(),
    retrieveAirwallexPaymentIntent: vi.fn(),
  };
});

function put(status: string, authorization?: string) {
  return new Request("http://localhost:3000/api/admin/orders", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify({ id: "order-1", status }),
  });
}

function refund(authorization = "Bearer admin-token", amount = 20) {
  return new Request("http://localhost:3000/api/admin/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization,
    },
    body: JSON.stringify({
      action: "refund",
      id: "order-1",
      amount,
      reason: "stock short",
      confirm: true,
    }),
  });
}

function seedOrder(
  db: MemoryDb,
  row: {
    status: string;
    refunded_amount?: number;
    sales_channel?: string;
    payment_provider?: string;
    payment_status?: string;
    paymentRow?: "succeeded" | "requires_payment_method" | "none";
    reserved?: boolean;
  }
) {
  db.seed("orders", [
    {
      id: "order-1",
      status: row.status,
      sales_channel: row.sales_channel ?? "website",
      payment_provider: row.payment_provider ?? "airwallex",
      payment_status: row.payment_status ?? "succeeded",
      fulfillment_status: "payment_failed",
      inventory_reserved: row.reserved ?? false,
      total_amount: 115,
      refunded_amount: row.refunded_amount ?? 0,
      currency: "USD",
      customer_email: "buyer@example.com",
      customer_name: "Ada Lovelace",
    },
  ]);
  if (row.paymentRow === "none") return;
  db.seed("payments", [
    {
      id: "pay-1",
      order_id: "order-1",
      provider: "airwallex",
      provider_payment_intent_id: "int_1",
      provider_request_id: "req-1",
      status: row.paymentRow ?? "succeeded",
      amount: 115,
      currency: "USD",
    },
  ]);
}

describe("inventory_exception admin actions", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    vi.mocked(createAirwallexRefund).mockReset();
    vi.mocked(createAirwallexRefund).mockResolvedValue({
      id: "rf_test",
      status: "RECEIVED",
      amount: 20,
      currency: "USD",
      payment_intent_id: "int_1",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("unexpected network call");
      })
    );
  });

  it("requires admin auth before changing an inventory_exception order", async () => {
    seedOrder(db, { status: "inventory_exception" });

    const missing = await PUT(put("paid"));
    expect(missing.status).toBe(401);

    const forbidden = await PUT(put("paid", "Bearer shopper-token"));
    expect(forbidden.status).toBe(403);
    expect(db.rowsOf("orders")[0].status).toBe("inventory_exception");
  });

  it.each(["paid", "processing", "cancelled"])(
    "moves an inventory_exception order to %s",
    async (status) => {
      seedOrder(db, { status: "inventory_exception" });

      const response = await PUT(put(status, "Bearer admin-token"));

      expect(response.status).toBe(200);
      expect(db.rowsOf("orders")[0].status).toBe(status);
      expect(db.rowsOf("orders")[0].fulfillment_status).toBe(status);
    }
  );

  it("marks an inventory_exception order refunded only after the money is fully returned", async () => {
    seedOrder(db, { status: "inventory_exception", refunded_amount: 115 });

    const response = await PUT(put("refunded", "Bearer admin-token"));

    expect(response.status).toBe(200);
    expect(db.rowsOf("orders")[0].status).toBe("refunded");
  });

  it("rejects a refunded label before the refund amount is complete, and rejects unknown or skipped statuses", async () => {
    seedOrder(db, { status: "inventory_exception", refunded_amount: 10 });

    const early = await PUT(put("refunded", "Bearer admin-token"));
    expect(early.status).toBe(400);
    expect(await early.json()).toEqual({
      error: "Order can be marked refunded only when total refunded amount is complete",
    });

    const skipped = await PUT(put("packed", "Bearer admin-token"));
    expect(skipped.status).toBe(400);
    expect((await skipped.json()).error).toBe(
      "Invalid status transition from inventory_exception to packed"
    );

    const unknown = await PUT(put("not-a-status", "Bearer admin-token"));
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({ error: "Invalid order status" });
    expect(db.rowsOf("orders")[0].status).toBe("inventory_exception");
  });

  it("refunds a paid inventory_exception order without calling Airwallex for real", async () => {
    seedOrder(db, { status: "inventory_exception" });

    const response = await POST(refund());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(createAirwallexRefund).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(body)).not.toContain("already fully refunded");
    expect(JSON.stringify(body)).not.toContain("buyer@example.com");
  });

  it("still says an order is fully refunded only when the refunded amount covers the total", async () => {
    seedOrder(db, { status: "inventory_exception", refunded_amount: 115 });

    const response = await POST(refund());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Order is already fully refunded" });
    expect(createAirwallexRefund).not.toHaveBeenCalled();
  });

  it("names an unsupported status instead of calling it fully refunded", async () => {
    seedOrder(db, { status: "failed" });

    const response = await POST(refund());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Order has unsupported status value" });
    expect(createAirwallexRefund).not.toHaveBeenCalled();
  });

  it("still refunds a cancelled order and a test order", async () => {
    seedOrder(db, { status: "cancelled" });
    const cancelled = await POST(refund());
    expect(cancelled.status).toBe(200);
    expect(createAirwallexRefund).toHaveBeenCalledTimes(1);

    db.rowsOf("orders")[0].status = "cancelled";
    db.rowsOf("orders")[0].sales_channel = "test";
    vi.mocked(createAirwallexRefund).mockClear();
    const testOrder = await POST(refund());
    expect(testOrder.status).toBe(200);
    expect(createAirwallexRefund).toHaveBeenCalledTimes(1);
  });

  it("does not mark an unpaid order paid or processing, and leaves stock alone", async () => {
    db.rowsOf("products")[0].stock_count = 4;
    seedOrder(db, {
      status: "pending",
      payment_status: "requires_payment_method",
      paymentRow: "none",
      reserved: true,
    });

    const paid = await PUT(put("paid", "Bearer admin-token"));
    const processing = await PUT(put("processing", "Bearer admin-token"));

    expect(paid.status).toBe(400);
    expect(await paid.json()).toEqual({
      error: "Order can be marked paid or processing only after the payment has succeeded",
    });
    expect(processing.status).toBe(400);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "pending",
      payment_status: "requires_payment_method",
      inventory_reserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(db.rowsOf("payments")).toEqual([]);
    expect(db.rpcCalls.filter((call) => call.fn.includes("inventory"))).toEqual([]);
    expect(db.writes.filter((write) => write.table === "orders" && write.op === "update")).toEqual([]);
  });

  it("accepts paid when only the payment row succeeded", async () => {
    seedOrder(db, {
      status: "inventory_exception",
      payment_status: "requires_payment_method",
      paymentRow: "succeeded",
    });

    const response = await PUT(put("paid", "Bearer admin-token"));

    expect(response.status).toBe(200);
    expect(db.rowsOf("orders")[0].status).toBe("paid");
    expect(db.rowsOf("payments")[0].status).toBe("succeeded");
  });

  it("does not advance a cancelled or test order along the pipeline", async () => {
    db.rowsOf("products")[0].stock_count = 4;
    seedOrder(db, { status: "cancelled", reserved: true });

    const packed = await PUT(put("packed", "Bearer admin-token"));
    expect(packed.status).toBe(400);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "cancelled",
      inventory_reserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(db.rowsOf("payments")[0].status).toBe("succeeded");
    expect(db.writes.filter((write) => write.table === "orders" && write.op === "update")).toEqual([]);

    db.rowsOf("orders")[0].status = "pending";
    db.rowsOf("orders")[0].sales_channel = "test";
    const paid = await PUT(put("paid", "Bearer admin-token"));
    expect(paid.status).toBe(400);
    expect(db.rowsOf("orders")[0].status).toBe("pending");
    expect(db.rowsOf("orders")[0].sales_channel).toBe("test");
  });

  it("marks a protected order refunded only when the refund is already complete", async () => {
    seedOrder(db, { status: "cancelled", sales_channel: "test", refunded_amount: 20 });

    const early = await PUT(put("refunded", "Bearer admin-token"));
    expect(early.status).toBe(400);
    expect(db.rowsOf("orders")[0].status).toBe("cancelled");

    db.rowsOf("orders")[0].refunded_amount = 115;
    const done = await PUT(put("refunded", "Bearer admin-token"));
    expect(done.status).toBe(200);
    expect(db.rowsOf("orders")[0].status).toBe("refunded");
  });

  it("hides admin order failures behind a generic body", async () => {
    const injected = dbError("driver-secret-xyz", "XX000");
    db.failWhen = (table, op) => (table === "orders" && op === "select" ? injected : null);

    const listed = await GET(
      new Request("http://localhost:3000/api/admin/orders", {
        headers: { authorization: "Bearer admin-token" },
      })
    );
    const listedBody = await listed.json();
    expect(listed.status).toBe(500);
    expect(listedBody).toEqual({ error: "Internal error" });
    expect(JSON.stringify(listedBody)).not.toContain("driver-secret-xyz");
    expect(listed.headers.get("cache-control")).toBe("no-store");

    db.failWhen = () => new Error("driver-secret-xyz") as never;
    const updated = await PUT(put("paid", "Bearer admin-token"));
    const updatedBody = await updated.json();
    expect(updated.status).toBe(500);
    expect(updatedBody).toEqual({ error: "Internal error" });
    expect(JSON.stringify(updatedBody)).not.toContain("driver-secret-xyz");
    expect(updated.headers.get("cache-control")).toBe("no-store");

    const refunded = await POST(refund());
    const refundedBody = await refunded.json();
    expect(refunded.status).toBe(500);
    expect(refundedBody).toEqual({ error: "Internal error" });
    expect(JSON.stringify(refundedBody)).not.toContain("driver-secret-xyz");
    expect(refunded.headers.get("cache-control")).toBe("no-store");
  });

  it("does not reveal a non-Airwallex refund driver message", async () => {
    seedOrder(db, { status: "paid", payment_provider: "stripe" });

    const response = await POST(refund());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Internal error" });
    expect(JSON.stringify(body)).not.toContain("apply_order_refund");
    expect(JSON.stringify(body)).not.toContain("does not exist");
    expect(createAirwallexRefund).not.toHaveBeenCalled();
    expect(db.rowsOf("orders")[0].status).toBe("paid");
  });
});
