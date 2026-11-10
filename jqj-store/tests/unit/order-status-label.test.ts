import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CUSTOMER_ORDER_STATUS_FALLBACK,
  INVENTORY_EXCEPTION_LABEL,
  ORDER_STATUS_ATTENTION_CLASS,
  ORDER_STATUS_NEUTRAL_CLASS,
  formatCustomerOrderStatusLabel,
  formatInventoryExceptionLabel,
  formatOrderStatusLabel,
  getAdminOrderStatusPresentation,
  getOrderStatusOptions,
  getOrderStatusPresentation,
  normalizeOrderStatus,
} from "@/lib/order-lifecycle";

const CUSTOMER_SLUGS = [
  "inventory_exception",
  "failed_fulfillment",
  "pending_payment",
  "payment_failed",
  "weird_status",
  "not-a-status",
] as const;

const FORBIDDEN_CUSTOMER_LABELS = [
  "inventory_exception",
  "Inventory exception",
  INVENTORY_EXCEPTION_LABEL,
  "Paid \u2013 stock issue (action needed)",
  formatInventoryExceptionLabel("payment_failed"),
  formatInventoryExceptionLabel("succeeded"),
  "failed_fulfillment",
  "pending_payment",
  "Failed fulfillment",
  "Pending payment",
  "FAILED FULFILLMENT",
  "PENDING PAYMENT",
  "INVENTORY EXCEPTION",
] as const;

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

describe("admin inventory exception presentation", () => {
  it("shows the attention pill and keeps Inventory exception selected", () => {
    const presentation = getAdminOrderStatusPresentation({
      status: "inventory_exception",
      fulfillmentStatus: "payment_failed",
      paymentStatus: "succeeded",
    });

    expect(presentation.label).toBe(INVENTORY_EXCEPTION_LABEL);
    expect(presentation.label).toBe("Paid \u2013 stock issue (action needed)");
    expect(presentation.flagged).toBe(true);
    expect(presentation.treatment).toBe("attention");
    expect(presentation.className).toBe(ORDER_STATUS_ATTENTION_CLASS);
    expect(presentation.showDropdown).toBe(true);
    expect(presentation.selectStatus).toBe("inventory_exception");

    const options = getOrderStatusOptions(presentation.selectStatus, "succeeded");
    expect(options).toEqual([
      "inventory_exception",
      "paid",
      "processing",
      "cancelled",
      "refunded",
    ]);
    expect(options).not.toEqual(["paid"]);
    const selected = options.find((option) => option === presentation.selectStatus) ?? options[0];
    expect(selected).toBe("inventory_exception");
    expect(formatOrderStatusLabel(selected)).toBe("Inventory exception");
  });

  it("keeps Inventory exception selected when fulfillment is already paid", () => {
    const presentation = getAdminOrderStatusPresentation({
      status: "inventory_exception",
      fulfillmentStatus: "paid",
      paymentStatus: "succeeded",
    });
    const options = getOrderStatusOptions(presentation.selectStatus, "succeeded");
    const selected = options.find((option) => option === presentation.selectStatus) ?? options[0];

    expect(presentation.selectStatus).toBe("inventory_exception");
    expect(selected).toBe("inventory_exception");
    expect(formatOrderStatusLabel(selected, "succeeded")).toBe("Inventory exception");
    expect(presentation.label).toBe("Paid \u2013 stock issue (action needed)");
    expect(options).toEqual([
      "inventory_exception",
      "paid",
      "processing",
      "cancelled",
      "refunded",
    ]);
  });

  it("does not call an unpaid inventory exception Paid and omits the paid transition", () => {
    const presentation = getAdminOrderStatusPresentation({
      status: "inventory_exception",
      fulfillmentStatus: "paid",
      paymentStatus: "payment_failed",
    });
    const options = getOrderStatusOptions(presentation.selectStatus, "payment_failed");

    expect(presentation.label).toBe("Stock issue \u2013 payment payment_failed (action needed)");
    expect(presentation.label).not.toContain("Paid");
    expect(presentation.flagged).toBe(true);
    expect(presentation.treatment).toBe("attention");
    expect(presentation.className).toBe(ORDER_STATUS_ATTENTION_CLASS);
    expect(presentation.showDropdown).toBe(true);
    expect(options).toEqual(["inventory_exception", "processing", "cancelled", "refunded"]);
    expect(options).not.toEqual(["paid"]);
    expect(options).not.toContain("paid");
    expect(formatOrderStatusLabel(options[0])).toBe("Inventory exception");
  });

  it("keeps failed_fulfillment and pending_payment raw on the admin presentation", () => {
    for (const status of ["failed_fulfillment", "pending_payment"] as const) {
      const presentation = getAdminOrderStatusPresentation({
        status,
        paymentStatus: "succeeded",
      });

      expect(presentation.label).toBe(status);
      expect(presentation.label).not.toContain("Paid");
      expect(presentation.flagged).toBe(false);
      expect(presentation.treatment).toBe("neutral");
      expect(presentation.className).toBe(ORDER_STATUS_NEUTRAL_CLASS);
      expect(presentation.showDropdown).toBe(true);
      expect(formatCustomerOrderStatusLabel(status)).toBe(CUSTOMER_ORDER_STATUS_FALLBACK);
      expect(formatCustomerOrderStatusLabel(status)).not.toBe(presentation.label);
    }
  });

  it("shows an unknown status raw in admin and never as Paid", () => {
    const presentation = getOrderStatusPresentation("weird_status");

    expect(presentation.label).toBe("weird_status");
    expect(presentation.label).not.toContain("Paid");
    expect(presentation.flagged).toBe(false);
    expect(presentation.treatment).toBe("neutral");
    expect(getAdminOrderStatusPresentation({ status: "weird_status" }).showDropdown).toBe(true);
  });

  it("leaves named pipeline statuses on the dropdown without an attention pill", () => {
    for (const [status, label] of [
      ["paid", "Paid"],
      ["packed", "Packed"],
      ["shipped", "Shipped"],
      ["delivered", "Delivered"],
      ["refunded", "Refunded"],
      ["pending", "Pending"],
      ["processing", "Processing"],
      ["cancelled", "Cancelled"],
    ] as const) {
      const presentation = getOrderStatusPresentation(status);
      expect(presentation.label).toBe(label);
      expect(presentation.treatment).toBe("pipeline");
      expect(presentation.flagged).toBe(false);
      expect(presentation.className).toBe("");
    }
  });
});

describe("formatCustomerOrderStatusLabel", () => {
  it.each(CUSTOMER_SLUGS)("returns Processing for %s and hides admin copy", (status) => {
    for (const paymentStatus of [undefined, null, "succeeded", "payment_failed"] as const) {
      const label = formatCustomerOrderStatusLabel(status, paymentStatus);
      expect(label).toBe("Processing");
      expect(label).toBe(CUSTOMER_ORDER_STATUS_FALLBACK);
      for (const forbidden of FORBIDDEN_CUSTOMER_LABELS) {
        expect(label).not.toBe(forbidden);
      }
      expect(label).not.toContain("_");
      expect(label.toLowerCase()).not.toContain("stock issue");
      expect(label.toLowerCase()).not.toContain("action needed");
    }
  });

  it("keeps named pipeline and legacy labels for customers", () => {
    expect(formatCustomerOrderStatusLabel("paid", "succeeded")).toBe("Paid");
    expect(formatCustomerOrderStatusLabel("paid")).toBe("Paid");
    expect(formatCustomerOrderStatusLabel("paid", "requires_payment_method")).toBe("Unpaid");
    expect(formatCustomerOrderStatusLabel("packed")).toBe("Packed");
    expect(formatCustomerOrderStatusLabel("shipped")).toBe("Shipped");
    expect(formatCustomerOrderStatusLabel("delivered")).toBe("Delivered");
    expect(formatCustomerOrderStatusLabel("refunded")).toBe("Refunded");
    expect(formatCustomerOrderStatusLabel("pending")).toBe("Pending");
    expect(formatCustomerOrderStatusLabel("processing")).toBe("Processing");
    expect(formatCustomerOrderStatusLabel("cancelled")).toBe("Cancelled");
    expect(formatCustomerOrderStatusLabel("")).toBe("Unknown");
  });

  it("does not render a status slug on the account order or fulfilment line", () => {
    const source = readFileSync(path.join(process.cwd(), "app/(store)/account/page.tsx"), "utf8");

    expect(source).toContain("formatCustomerOrderStatusLabel(order.status, order.payment_status)");
    expect(source).toContain("Fulfilment: {formatCustomerOrderStatusLabel(order.fulfillment_status)}");
    expect(source).not.toContain("formatOrderStatusLabel(");
    expect(source).not.toContain("fulfillment_status.replace");
  });

  it("selects the admin presentation status beside the attention pill", () => {
    const source = readFileSync(path.join(process.cwd(), "app/admin/page.tsx"), "utf8");

    expect(source).toContain("getAdminOrderStatusPresentation");
    expect(source).toContain("statusOption === statusPresentation.selectStatus");
    expect(source).toContain('data-order-status-flag={statusPresentation.flagged ? "attention" : "neutral"}');
    expect(source).toContain("{statusPresentation.label}");
    expect(source).toContain("{formatOrderStatusLabel(statusOption)}");
  });
});
