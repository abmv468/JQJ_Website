import { beforeEach, describe, expect, it } from "vitest";
import { applyAirwallexRefundEvent } from "@/lib/payments/airwallex-orders";
import { createCheckoutDb, setActiveDb, type MemoryDb } from "../helpers/memory-db";

function seedOrder(
  db: MemoryDb,
  order: { id: string; status: string; salesChannel?: string; refunded?: number }
) {
  db.seed("orders", [
    {
      id: order.id,
      status: order.status,
      sales_channel: order.salesChannel ?? "website",
      payment_provider: "airwallex",
      payment_status: "succeeded",
      fulfillment_status: order.status === "paid" ? "paid" : "pending_payment",
      inventory_reserved: false,
      total_amount: 115,
      refunded_amount: order.refunded ?? 0,
      currency: "USD",
      customer_email: "buyer@example.com",
    },
  ]);
  db.seed("payments", [
    {
      id: `pay-${order.id}`,
      order_id: order.id,
      provider: "airwallex",
      provider_payment_intent_id: `int_${order.id}`,
      status: "succeeded",
      amount: 115,
      currency: "USD",
    },
  ]);
}

async function settle(db: MemoryDb, orderId: string, refundId: string, amount: number) {
  return applyAirwallexRefundEvent(db as never, {
    eventName: "refund.settled",
    refundObject: {
      id: refundId,
      payment_intent_id: `int_${orderId}`,
      amount,
      currency: "USD",
      status: "SETTLED",
    },
  });
}

describe("refunds on protected orders", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
  });

  it("keeps a cancelled order cancelled after a partial and a full refund", async () => {
    seedOrder(db, { id: "order-cancelled", status: "cancelled" });

    await settle(db, "order-cancelled", "rf_partial", 20);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "cancelled",
      fulfillment_status: "pending_payment",
      refunded_amount: 20,
    });

    await settle(db, "order-cancelled", "rf_rest", 95);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "cancelled",
      fulfillment_status: "pending_payment",
      refunded_amount: 115,
    });
  });

  it("keeps a test order from being revived by a refund", async () => {
    seedOrder(db, { id: "order-test", status: "pending", salesChannel: "test" });

    await settle(db, "order-test", "rf_test_partial", 20);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "pending",
      sales_channel: "test",
      fulfillment_status: "pending_payment",
      refunded_amount: 20,
    });

    await settle(db, "order-test", "rf_test_rest", 95);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "pending",
      fulfillment_status: "pending_payment",
      refunded_amount: 115,
    });
  });

  it("still moves a normal order to paid or refunded", async () => {
    seedOrder(db, { id: "order-live", status: "paid" });

    await settle(db, "order-live", "rf_live_partial", 20);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      fulfillment_status: "paid",
      refunded_amount: 20,
    });

    await settle(db, "order-live", "rf_live_rest", 95);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "refunded",
      fulfillment_status: "refunded",
      refunded_amount: 115,
    });
  });
});
