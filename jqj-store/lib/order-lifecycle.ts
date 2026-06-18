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

export function formatOrderStatusLabel(status: string): string {
  const normalized = normalizeOrderStatus(status) ?? "paid";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
