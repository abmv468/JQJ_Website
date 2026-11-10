import { describe, expect, it } from "vitest";
import {
  INVENTORY_EXCEPTION_LABEL,
  ORDER_STATUS_ATTENTION_CLASS,
  ORDER_STATUS_NEUTRAL_CLASS,
  formatOrderStatusLabel,
  getAdminOrderStatusPresentation,
  getOrderStatusOptions,
  getOrderStatusPresentation,
} from "@/lib/order-lifecycle";

const KNOWN_STATUSES = [
  ["paid", "Paid"],
  ["packed", "Packed"],
  ["shipped", "Shipped"],
  ["delivered", "Delivered"],
  ["refunded", "Refunded"],
  ["pending", "Paid"],
  ["processing", "Paid"],
  ["cancelled", "Refunded"],
  ["PAID", "Paid"],
  [" Refunded ", "Refunded"],
] as const;

const RAW_BACKEND_STATUSES = [
  ["failed_fulfillment", "failed_fulfillment"],
  ["pending_payment", "pending_payment"],
] as const;

describe("formatOrderStatusLabel", () => {
  it("flags a succeeded inventory_exception, including the payment_failed fulfillment pair", () => {
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
    // Deliberately non-actionable until the backend accepts status moves for inventory_exception (BE-018).
    expect(getOrderStatusOptions(presentation.selectStatus)).toEqual(["paid"]);
  });

  it("flags inventory_exception with payment_failed and does not call it Paid", () => {
    const presentation = getAdminOrderStatusPresentation({
      status: "inventory_exception",
      fulfillmentStatus: "paid",
      paymentStatus: "payment_failed",
    });

    expect(presentation.label).toBe("Stock issue \u2013 payment payment_failed (action needed)");
    expect(presentation.label).not.toContain("Paid");
    expect(presentation.flagged).toBe(true);
    expect(presentation.treatment).toBe("attention");
    expect(presentation.className).toBe(ORDER_STATUS_ATTENTION_CLASS);
    expect(presentation.showDropdown).toBe(true);
  });

  it("requires the exact rendered labels for failed_fulfillment and pending_payment", () => {
    expect(RAW_BACKEND_STATUSES).toEqual([
      ["failed_fulfillment", "failed_fulfillment"],
      ["pending_payment", "pending_payment"],
    ]);
  });

  it.each(RAW_BACKEND_STATUSES)("renders backend status %s as %s", (status, label) => {
    const presentation = getAdminOrderStatusPresentation({
      status,
      paymentStatus: "succeeded",
    });

    expect(formatOrderStatusLabel(status)).toBe(label);
    expect(presentation.label).toBe(label);
    expect(presentation.label).not.toContain("Paid");
    expect(presentation.flagged).toBe(false);
    expect(presentation.treatment).toBe("neutral");
    expect(presentation.className).toBe(ORDER_STATUS_NEUTRAL_CLASS);
    expect(presentation.showDropdown).toBe(true);
  });

  it("shows an unknown status raw and never as Paid", () => {
    const presentation = getOrderStatusPresentation("weird_status");

    expect(formatOrderStatusLabel("weird_status")).toBe("weird_status");
    expect(presentation.label).toBe("weird_status");
    expect(presentation.label).not.toContain("Paid");
    expect(presentation.flagged).toBe(false);
    expect(presentation.treatment).toBe("neutral");
    expect(getAdminOrderStatusPresentation({ status: "weird_status" }).showDropdown).toBe(true);
  });

  it.each(KNOWN_STATUSES)("leaves known status %s labelled %s", (status, label) => {
    const presentation = getOrderStatusPresentation(status);

    expect(formatOrderStatusLabel(status)).toBe(label);
    expect(presentation.label).toBe(label);
    expect(presentation.flagged).toBe(false);
    expect(presentation.treatment).toBe("pipeline");
    expect(presentation.className).toBe("");
  });
});
