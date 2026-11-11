import { describe, expect, it } from "vitest";
import {
  formatOrderStatusLabel,
  getOrderStatusOptions,
  normalizeOrderStatus,
} from "@/lib/order-lifecycle";

describe("order status labels", () => {
  it("labels an inventory exception only when that is the raw status", () => {
    expect(normalizeOrderStatus("inventory_exception")).toBeNull();
    expect(formatOrderStatusLabel("inventory_exception")).toBe("Inventory exception");
    expect(formatOrderStatusLabel("inventory_exception", "succeeded")).toBe("Inventory exception");
    expect(formatOrderStatusLabel("inventory_exception", "Succeeded ")).toBe("Inventory exception");
    expect(formatOrderStatusLabel("paid", "succeeded")).toBe("Paid");
  });

  it("does not call an unpaid or legacy status an inventory exception or Paid", () => {
    expect(formatOrderStatusLabel("paid", "requires_payment_method")).toBe("Unpaid");
    expect(formatOrderStatusLabel("pending")).toBe("Pending");
    expect(formatOrderStatusLabel("processing")).toBe("Processing");
    expect(formatOrderStatusLabel("cancelled")).toBe("Cancelled");
    expect(formatOrderStatusLabel("")).toBe("Unknown");
    expect(formatOrderStatusLabel("not-a-status")).toBe("Not-a-status");
    for (const label of [
      formatOrderStatusLabel("paid", "requires_payment_method"),
      formatOrderStatusLabel("pending"),
      formatOrderStatusLabel("pending", "requires_payment_method"),
      formatOrderStatusLabel(""),
      formatOrderStatusLabel("not-a-status"),
    ]) {
      expect(label).not.toBe("Inventory exception");
    }
    expect(formatOrderStatusLabel("pending")).not.toBe("Paid");
    expect(formatOrderStatusLabel("processing")).not.toBe("Paid");
    expect(formatOrderStatusLabel("cancelled")).not.toBe("Refunded");
  });

  it("gives the inventory-exception dropdown a distinct label for each transition", () => {
    const options = getOrderStatusOptions("inventory_exception", "succeeded");
    expect(options).toEqual([
      "inventory_exception",
      "paid",
      "processing",
      "cancelled",
      "refunded",
    ]);
    expect(options.map((option) => formatOrderStatusLabel(option, "succeeded"))).toEqual([
      "Inventory exception",
      "Paid",
      "Processing",
      "Cancelled",
      "Refunded",
    ]);
  });
});
