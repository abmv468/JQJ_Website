import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PAID_CLAIM_LOST_EVENT,
  PAYMENT_AFTER_EXPIRY_UNFULFILLED_EVENT,
  reportPaidClaimLost,
  reportPaymentAfterExpiryUnfulfilled,
} from "@/lib/payments/airwallex-orders";

describe("jqd_alert log lines", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs payment_after_expiry_unfulfilled with the order id only", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    reportPaymentAfterExpiryUnfulfilled({
      orderId: "order-short",
      paymentIntentId: "int_secret",
      shortfall: [{ productId: "prod-amethyst", variantId: null, requested: 1, available: 0 }],
    });

    const line = spy.mock.calls
      .map((call) => call[0])
      .find((value) => typeof value === "string" && value.includes("jqd_alert"));
    expect(JSON.parse(String(line))).toEqual({
      tag: "jqd_alert",
      event: PAYMENT_AFTER_EXPIRY_UNFULFILLED_EVENT,
      orderId: "order-short",
    });
    expect(String(line)).not.toContain("int_secret");
    expect(String(line)).not.toContain("buyer@example.com");
  });

  it("logs paid_claim_lost with the order id only", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    reportPaidClaimLost("order-race");

    const line = spy.mock.calls
      .map((call) => call[0])
      .find((value) => typeof value === "string" && value.includes("jqd_alert"));
    expect(JSON.parse(String(line))).toEqual({
      tag: "jqd_alert",
      event: PAID_CLAIM_LOST_EVENT,
      orderId: "order-race",
    });
    expect(Object.keys(JSON.parse(String(line))).sort()).toEqual(["event", "orderId", "tag"]);
  });
});
