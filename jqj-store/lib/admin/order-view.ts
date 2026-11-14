export type CheckoutAddress = {
  address?: unknown;
  apartment?: unknown;
  city?: unknown;
  region?: unknown;
  country?: unknown;
  phone?: unknown;
  payment_method?: unknown;
};

export type OrderLineView = {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  amount: number;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function sumOrderRevenue(orders: ReadonlyArray<{ total_amount: number | string }>): number {
  return orders.reduce((sum, order) => sum + Number(order.total_amount), 0);
}

export function lineAmount(price: number | string, quantity: number | string): number {
  return Number(price) * Number(quantity);
}

export function orderLines(
  items: ReadonlyArray<{
    id?: string;
    product_name?: string | null;
    sku?: string | null;
    quantity?: number | string | null;
    price_at_purchase?: number | string | null;
  }> | null | undefined
): OrderLineView[] {
  return (items ?? []).map((item, index) => {
    const quantity = Number(item.quantity ?? 0);
    const price = Number(item.price_at_purchase ?? 0);
    return {
      id: item.id || `line-${index}`,
      name: item.product_name?.trim() || "Item",
      sku: item.sku?.trim() || "\u2014",
      quantity,
      amount: lineAmount(price, quantity),
    };
  });
}

/** Checkout snapshot only. Payment method stays out of the address lines. */
export function formatCheckoutAddress(address: CheckoutAddress | null | undefined): string[] {
  if (!address) return [];
  const street = [text(address.address), text(address.apartment)].filter(Boolean).join(", ");
  const place = [text(address.city), text(address.region), text(address.country)].filter(Boolean).join(", ");
  const phone = text(address.phone);
  return [street, place, phone].filter(Boolean);
}

/** Failed provider refunds stay in history and do not raise the refunded total. */
export function settledRefundedAmount(input: {
  refundedAmount: number;
  providerRefunds?: ReadonlyArray<{ amount?: number | string | null; status?: string | null }> | null;
}): number {
  const provider = (input.providerRefunds ?? [])
    .filter((refund) => (refund.status ?? "").toLowerCase() !== "failed")
    .reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
  return Math.max(Number(input.refundedAmount) || 0, provider);
}

export function paymentMethodLabel(input: {
  paymentProvider?: string | null;
  paymentMethod?: string | null;
}): string {
  const raw = (input.paymentProvider || input.paymentMethod || "").trim().toLowerCase();
  if (!raw) return "\u2014";
  if (raw === "airwallex") return "Airwallex";
  if (raw === "cod") return "Cash on delivery";
  if (raw === "stripe") return "Card";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
