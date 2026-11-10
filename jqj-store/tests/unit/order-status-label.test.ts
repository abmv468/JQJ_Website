import { describe, expect, it } from "vitest";
import { formatOrderStatusLabel, getOrderStatusOptions } from "@/lib/order-lifecycle";

describe("order status labels", () => {
  it("does not call an inventory exception paid unless the payment succeeded", () => {
    expect(formatOrderStatusLabel("inventory_exception")).toBe("Inventory exception");
    expect(formatOrderStatusLabel("inventory_exception", "succeeded")).toBe("Inventory exception");
    expect(formatOrderStatusLabel("inventory_exception", "Succeeded ")).toBe("Inventory exception");
    expect(formatOrderStatusLabel("paid", "requires_payment_method")).toBe("Inventory exception");
    expect(formatOrderStatusLabel("paid", "succeeded")).toBe("Paid");

    expect(getOrderStatusOptions("inventory_exception", "requires_payment_method")).toEqual([
      "inventory_exception",
      "processing",
      "cancelled",
      "refunded",
    ]);
    expect(getOrderStatusOptions("inventory_exception", "succeeded")).toEqual([
      "inventory_exception",
      "paid",
      "processing",
      "cancelled",
      "refunded",
    ]);
  });
});
