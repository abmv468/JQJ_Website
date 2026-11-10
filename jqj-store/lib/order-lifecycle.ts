export const ORDER_PIPELINE_STATUSES = ["paid", "packed", "shipped", "delivered"] as const;

export type OrderPipelineStatus = (typeof ORDER_PIPELINE_STATUSES)[number];
export type OrderStatus = OrderPipelineStatus | "refunded";

const ORDER_STATUS_SET = new Set<OrderStatus>([...ORDER_PIPELINE_STATUSES, "refunded"]);
const LEGACY_ORDER_STATUS_MAP: Record<string, OrderStatus> = {
  pending: "paid",
  processing: "paid",
  cancelled: "refunded",
};

const INVENTORY_EXCEPTION_STATUS = "inventory_exception";
const INVENTORY_EXCEPTION_NEXT = new Set(["paid", "processing", "cancelled", "refunded"]);

export function isInventoryExceptionStatus(value: string) {
  return value.trim().toLowerCase() === INVENTORY_EXCEPTION_STATUS;
}

export function isSucceededPaymentStatus(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase() === "succeeded";
}

export type AdminStatusOption = OrderStatus | "processing" | "cancelled" | "inventory_exception";

export function canLeaveInventoryException(next: string) {
  return INVENTORY_EXCEPTION_NEXT.has(next.trim().toLowerCase());
}

export function isKnownAdminOrderStatus(value: string) {
  const normalized = value.trim().toLowerCase();
  return isOrderStatus(normalized) || normalized === "processing" || normalized === "cancelled";
}

const NEXT_STATUS: Partial<Record<OrderPipelineStatus, OrderPipelineStatus>> = {
  paid: "packed",
  packed: "shipped",
  shipped: "delivered",
};

const REFUND_EPSILON = 0.00001;

export function isOrderStatus(value: string): value is OrderStatus {
  return ORDER_STATUS_SET.has(value as OrderStatus);
}

export function normalizeOrderStatus(value: string): OrderStatus | null {
  const normalized = value.trim().toLowerCase();
  if (isOrderStatus(normalized)) return normalized;
  return LEGACY_ORDER_STATUS_MAP[normalized] ?? null;
}

export function getOrderStatusOptions(
  current: string,
  paymentStatus?: string | null
): AdminStatusOption[] {
  if (isInventoryExceptionStatus(current)) {
    const next: AdminStatusOption[] = ["processing", "cancelled", "refunded"];
    if (isSucceededPaymentStatus(paymentStatus)) next.unshift("paid");
    return ["inventory_exception", ...next];
  }
  const normalized = normalizeOrderStatus(current);
  if (!normalized) return ["paid"];
  if (normalized === "refunded" || normalized === "delivered") return [normalized];
  const next = NEXT_STATUS[normalized];
  return next ? [normalized, next] : [normalized];
}

export function canTransitionOrderStatus(current: string, next: string): boolean {
  if (!isOrderStatus(next)) return false;
  const normalized = normalizeOrderStatus(current);
  if (!normalized) return next === "paid";
  if (normalized === next) return true;
  if (normalized === "refunded" || next === "refunded") return false;
  return NEXT_STATUS[normalized] === next;
}

export function isFullyRefunded(totalAmount: number, refundedAmount: number): boolean {
  return totalAmount > 0 && refundedAmount + REFUND_EPSILON >= totalAmount;
}

export function hasPartialRefund(totalAmount: number, refundedAmount: number): boolean {
  return refundedAmount > 0 && !isFullyRefunded(totalAmount, refundedAmount);
}

export function formatOrderStatusLabel(status: string, paymentStatus?: string | null): string {
  if (isInventoryExceptionStatus(status)) return "Inventory exception";
  const raw = status.trim().toLowerCase();
  if (!raw) return "Unknown";
  if (raw === "paid") {
    return paymentStatus != null && !isSucceededPaymentStatus(paymentStatus) ? "Unpaid" : "Paid";
  }
  if (raw === "pending") return "Pending";
  if (raw === "processing") return "Processing";
  if (raw === "cancelled") return "Cancelled";
  if (raw === "refunded") return "Refunded";
  if (raw === "packed") return "Packed";
  if (raw === "shipped") return "Shipped";
  if (raw === "delivered") return "Delivered";
  return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, " ");
}

/** Customer account copy for statuses that are not a named pipeline or legacy label. */
export const CUSTOMER_ORDER_STATUS_FALLBACK = "Processing";

const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  cancelled: "Cancelled",
  refunded: "Refunded",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
};

/**
 * Account-page label. Inventory exceptions and other non-pipeline slugs
 * stay on this fallback. Admin attention copy is not used here.
 */
export function formatCustomerOrderStatusLabel(
  status: string | null | undefined,
  paymentStatus?: string | null
): string {
  const raw = (status ?? "").trim().toLowerCase();
  if (!raw) return "Unknown";
  if (raw === "paid") {
    return paymentStatus != null && !isSucceededPaymentStatus(paymentStatus) ? "Unpaid" : "Paid";
  }
  return CUSTOMER_STATUS_LABELS[raw] ?? CUSTOMER_ORDER_STATUS_FALLBACK;
}

/** Shown only when payment_status is succeeded. Fulfillment status never supplies this word. */
export const INVENTORY_EXCEPTION_LABEL = "Paid \u2013 stock issue (action needed)";

/**
 * Same attention treatment as the product-card low-stock badge
 * (gold border, gold text, dark fill). Not the plain fulfillment select.
 */
export const ORDER_STATUS_ATTENTION_CLASS =
  "inline-flex rounded-full border border-brand-gold/45 bg-black/58 px-2.5 py-1 text-[11px] leading-snug text-brand-gold";

export const ORDER_STATUS_NEUTRAL_CLASS = "text-xs text-brand-muted";

export type OrderStatusTreatment = "pipeline" | "attention" | "neutral";

export type OrderStatusPresentation = {
  label: string;
  flagged: boolean;
  treatment: OrderStatusTreatment;
  className: string;
};

export type AdminOrderStatusInput = {
  status?: string | null;
  fulfillmentStatus?: string | null;
  paymentStatus?: string | null;
};

export type AdminOrderStatusPresentation = OrderStatusPresentation & {
  showDropdown: boolean;
  selectStatus: string;
};

/**
 * Attention copy for a stored inventory_exception.
 * "Paid" is chosen only from payment_status. fulfillment_status is ignored here.
 */
export function formatInventoryExceptionLabel(paymentStatus: string): string {
  const raw = paymentStatus.trim();
  if (isSucceededPaymentStatus(raw)) return INVENTORY_EXCEPTION_LABEL;
  return `Stock issue \u2013 payment ${raw} (action needed)`;
}

export function getOrderStatusPresentation(status: string): OrderStatusPresentation {
  if (!normalizeOrderStatus(status)) {
    return {
      label: status,
      flagged: false,
      treatment: "neutral",
      className: ORDER_STATUS_NEUTRAL_CLASS,
    };
  }
  return {
    label: formatOrderStatusLabel(status),
    flagged: false,
    treatment: "pipeline",
    className: "",
  };
}

export function getAdminOrderStatusPresentation(
  input: AdminOrderStatusInput
): AdminOrderStatusPresentation {
  const status = input.status ?? "";
  const fulfillmentStatus = input.fulfillmentStatus ?? "";
  const exceptionSource = [status, fulfillmentStatus].find((value) => isInventoryExceptionStatus(value));

  if (exceptionSource) {
    const rawPayment = (input.paymentStatus ?? "").trim();
    return {
      label: formatInventoryExceptionLabel(rawPayment.length > 0 ? rawPayment : "unknown"),
      flagged: true,
      treatment: "attention",
      className: ORDER_STATUS_ATTENTION_CLASS,
      showDropdown: true,
      selectStatus: exceptionSource,
    };
  }

  const displayed = fulfillmentStatus.length > 0 ? fulfillmentStatus : status;
  const presentation = getOrderStatusPresentation(displayed);
  return {
    ...presentation,
    showDropdown: true,
    selectStatus: displayed,
  };
}
