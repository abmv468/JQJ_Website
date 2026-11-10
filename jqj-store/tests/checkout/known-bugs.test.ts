import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/checkout/airwallex/route";
import { createAirwallexPaymentIntent } from "@/lib/payments/airwallex";
import { applyAirwallexPaymentIntentStatus } from "@/lib/payments/airwallex-orders";
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

/**
 * Regressions for the reservation bugs that used to be `it.fails`.
 * Bug #1: a success after the reservation was released must not become paid
 * with no stock held.
 * Bug #3: a sweep error must not fail a new card checkout. The sweep no longer
 * runs inside checkout.
 */

describe("known checkout bugs", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    delete process.env.RESEND_API_KEY;
  });

  it(
    "known bug #1: a late success after the reservation sweep must not leave a paid order with no stock held",
    async () => {
      db.rowsOf("products")[0].stock_count = 5;
      db.seed("orders", [
        {
          id: "order-late",
          status: "failed",
          payment_provider: "airwallex",
          payment_status: "abandoned",
          fulfillment_status: "payment_failed",
          inventory_reserved: false,
          total_amount: 115,
          subtotal_amount: 100,
          shipping_amount: 15,
          currency: "USD",
          customer_email: "buyer@example.com",
          customer_name: "Ada Lovelace",
          shipping_address: {
            address: "1 Atelier Lane",
            city: "Austin",
            region: "TX",
            country: "United States",
          },
        },
      ]);
      db.seed("order_items", [
        {
          id: "item-late",
          order_id: "order-late",
          product_id: "prod-amethyst",
          variant_id: null,
          quantity: 1,
          product_name: "Amethyst Bracelet XV (5mm)",
          price_at_purchase: 100,
        },
      ]);
      db.seed("payments", [
        {
          id: "pay-late",
          order_id: "order-late",
          provider: "airwallex",
          provider_payment_intent_id: "int_late",
          provider_request_id: "req-late",
          status: "requires_payment_method",
          amount: 115,
          currency: "USD",
        },
      ]);

      await applyAirwallexPaymentIntentStatus(db as never, {
        paymentIntentId: "int_late",
        nextStatus: "succeeded",
        force: true,
      });

      const order = db.rowsOf("orders")[0];
      const paid = order.status === "paid" || order.payment_status === "succeeded";
      if (paid) {
        expect(order.inventory_reserved).toBe(true);
        expect(db.rowsOf("products")[0].stock_count).toBe(4);
      } else {
        expect(order.payment_status).not.toBe("succeeded");
        expect(db.rowsOf("products")[0].stock_count).toBe(5);
      }
    }
  );

  it(
    "known bug #3: a reservation sweep error must not fail a new card checkout",
    async () => {
      db.failWhen = (table, _op, filters) =>
        table === "orders" && filters.some((filter) => filter.column === "inventory_reserved")
          ? dbError("sweep unavailable", "XX000")
          : null;
      vi.mocked(createAirwallexPaymentIntent).mockResolvedValue({
        id: "int_new",
        status: "REQUIRES_PAYMENT_METHOD",
        amount: 115,
        currency: "USD",
        client_secret: "secret_test",
      });

      const response = await POST(
        new Request("http://localhost:3000/api/checkout/airwallex", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [checkoutItem()],
            customer: checkoutCustomer,
            idempotencyKey: "11111111-1111-4111-8111-111111111111",
          }),
        })
      );

      expect(response.status).toBe(200);
    }
  );
});
