export const ORDER_PIPELINE_STATUSES = ["paid", "packed", "shipped", "delivered"] as const;

export type OrderPipelineStatus = (typeof ORDER_PIPELINE_STATUSES)[number];
export type OrderStatus = OrderPipelineStatus | "refunded";

const ORDER_STATUS_SET = new Set<OrderStatus>([...ORDER_PIPELINE_STATUSES, "refunded"]);
const LEGACY_ORDER_STATUS_MAP: Record<string, OrderStatus> = {
  pending: "paid",
  processing: "paid",
  cancelled: "refunded",
};

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

export function getOrderStatusOptions(current: string): OrderStatus[] {
  const normalized = normalizeOrderStatus(current);
  if (!normalized) return ["paid"];
  if (normalized === "refunded" || normalized === "delivered") return [normalized];
  const next = NEXT_STATUS[normalized];
  return next ? [normalized, next] : [normalized];
}

export function canTransitionOrderStatus(current: string, next: OrderStatus): boolean {
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

const INVENTORY_EXCEPTION_STATUS = "inventory_exception";

/** Admin copy for a paid order that could not be fulfilled from stock. */
export const INVENTORY_EXCEPTION_LABEL = "Paid \u2013 stock issue (action needed)";

/**
 * Same attention pill as the product-card low-stock badge
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

function statusKey(status: string): string {
  return status.trim().toLowerCase();
}

export function isInventoryExceptionStatus(status: string): boolean {
  return statusKey(status) === INVENTORY_EXCEPTION_STATUS;
}

export function formatOrderStatusLabel(status: string): string {
  if (isInventoryExceptionStatus(status)) return INVENTORY_EXCEPTION_LABEL;
  const normalized = normalizeOrderStatus(status);
  // Do not substitute a pipeline label. Unknown statuses render as stored.
  if (!normalized) return status;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function getOrderStatusPresentation(status: string): OrderStatusPresentation {
  const label = formatOrderStatusLabel(status);
  if (isInventoryExceptionStatus(status)) {
    return {
      label,
      flagged: true,
      treatment: "attention",
      className: ORDER_STATUS_ATTENTION_CLASS,
    };
  }
  if (!normalizeOrderStatus(status)) {
    return {
      label,
      flagged: false,
      treatment: "neutral",
      className: ORDER_STATUS_NEUTRAL_CLASS,
    };
  }
  return {
    label,
    flagged: false,
    treatment: "pipeline",
    className: "",
  };
}

/**
 * Status string the admin orders table should label.
 * Stock shortfalls are stored on `orders.status` while `fulfillment_status`
 * may be something else (for example `payment_failed`). Prefer the exception
 * so the cell does not fall through to a pipeline label.
 */
export function resolveAdminOrderStatus(
  status: string | null | undefined,
  fulfillmentStatus?: string | null
): string {
  if (typeof status === "string" && isInventoryExceptionStatus(status)) return status;
  if (typeof fulfillmentStatus === "string" && isInventoryExceptionStatus(fulfillmentStatus)) {
    return fulfillmentStatus;
  }
  if (typeof fulfillmentStatus === "string" && fulfillmentStatus.length > 0) return fulfillmentStatus;
  if (typeof status === "string") return status;
  return "";
}
