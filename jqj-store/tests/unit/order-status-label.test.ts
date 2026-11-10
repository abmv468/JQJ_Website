import { describe, expect, it } from "vitest";
import {
  INVENTORY_EXCEPTION_LABEL,
  ORDER_STATUS_ATTENTION_CLASS,
  ORDER_STATUS_NEUTRAL_CLASS,
  formatOrderStatusLabel,
  getOrderStatusPresentation,
  resolveAdminOrderStatus,
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

describe("formatOrderStatusLabel", () => {
  it("flags inventory_exception with the stock-issue label", () => {
    const presentation = getOrderStatusPresentation("inventory_exception");

    expect(formatOrderStatusLabel("inventory_exception")).toBe(INVENTORY_EXCEPTION_LABEL);
    expect(formatOrderStatusLabel("inventory_exception")).toBe("Paid \u2013 stock issue (action needed)");
    expect(presentation.label).toBe(INVENTORY_EXCEPTION_LABEL);
    expect(presentation.label).not.toBe("Paid");
    expect(presentation.flagged).toBe(true);
    expect(presentation.treatment).toBe("attention");
    expect(presentation.className).toBe(ORDER_STATUS_ATTENTION_CLASS);
    expect(presentation.className).toContain("border-brand-gold/45");
    expect(presentation.className).toContain("text-brand-gold");
    expect(presentation.className).not.toContain("bg-transparent");
  });

  it("keeps the stock-issue flag when fulfillment_status is a different value", () => {
    const displayed = resolveAdminOrderStatus("inventory_exception", "payment_failed");
    const presentation = getOrderStatusPresentation(displayed);

    expect(displayed).toBe("inventory_exception");
    expect(presentation.label).toBe("Paid \u2013 stock issue (action needed)");
    expect(presentation.flagged).toBe(true);
    expect(presentation.treatment).toBe("attention");
  });

  it("shows an unknown status raw and never as Paid", () => {
    const presentation = getOrderStatusPresentation("weird_status");

    expect(formatOrderStatusLabel("weird_status")).toBe("weird_status");
    expect(presentation.label).toBe("weird_status");
    expect(presentation.label).not.toBe("Paid");
    expect(presentation.flagged).toBe(false);
    expect(presentation.treatment).toBe("neutral");
    expect(presentation.className).toBe(ORDER_STATUS_NEUTRAL_CLASS);
    expect(presentation.className).not.toBe(ORDER_STATUS_ATTENTION_CLASS);

    expect(formatOrderStatusLabel("payment_failed")).toBe("payment_failed");
    expect(formatOrderStatusLabel("failed")).toBe("failed");
    expect(getOrderStatusPresentation("payment_failed").flagged).toBe(false);
  });

  it.each(KNOWN_STATUSES)("leaves known status %s labelled %s", (status, label) => {
    const presentation = getOrderStatusPresentation(status);

    expect(formatOrderStatusLabel(status)).toBe(label);
    expect(presentation.label).toBe(label);
    expect(presentation.flagged).toBe(false);
    expect(presentation.treatment).toBe("pipeline");
    expect(presentation.className).toBe("");
  });

  it("still prefers fulfillment status for ordinary pipeline orders", () => {
    expect(resolveAdminOrderStatus("processing", "paid")).toBe("paid");
    expect(resolveAdminOrderStatus("paid", "packed")).toBe("packed");
    expect(getOrderStatusPresentation(resolveAdminOrderStatus("processing", "paid")).label).toBe("Paid");
    expect(getOrderStatusPresentation(resolveAdminOrderStatus("processing", "paid")).flagged).toBe(false);
  });
});
