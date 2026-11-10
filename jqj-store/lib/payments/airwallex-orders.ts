import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendInventoryExceptionAlert, sendOrderEmails } from "@/lib/email";
import { normalizeCurrency } from "@/lib/currency";
import type { ResolvedCheckoutItem } from "@/lib/inventory";
import {
  AIRWALLEX_PROVIDER,
  cancelAirwallexPaymentIntent,
  isPendingPaymentStatus,
  isSuccessfulPaymentStatus,
  isTerminalFailedPaymentStatus,
  normalizeAirwallexPaymentStatus,
  normalizeAirwallexRefundStatus,
  retrieveAirwallexPaymentIntent,
  type AirwallexPaymentIntent,
  type InternalPaymentStatus,
} from "@/lib/payments/airwallex";

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

interface PaymentRow {
  id: string;
  order_id: string;
  provider: string;
  provider_payment_intent_id: string;
  provider_request_id: string | null;
  status: string;
  amount: number | string | null;
  currency: string | null;
  last_event_created_at: string | null;
}

interface OrderRow {
  id: string;
  status: string | null;
  fulfillment_status: string | null;
  payment_status: string | null;
  inventory_reserved: boolean | null;
  paid_at: string | null;
  updated_at: string | null;
  total_amount: number | string | null;
  refunded_amount: number | string | null;
}

interface OrderItemRow {
  product_id: string | null;
  variant_id: string | null;
  quantity: number;
  product_name: string;
  variant_size: string | null;
  variant_material: string | null;
  price_at_purchase: number;
}

interface OrderEmailRow {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  subtotal_amount: number | string | null;
  shipping_amount: number | string | null;
  total_amount: number | string | null;
  currency: string | null;
  shipping_address: Record<string, unknown> | null;
  confirmation_email_sent_at: string | null;
  order_items: OrderItemRow[];
}

const PAYMENT_STATUS_WEIGHT: Record<InternalPaymentStatus, number> = {
  unknown: 0,
  requires_payment_method: 10,
  requires_customer_action: 20,
  pending: 30,
  pending_review: 35,
  failed: 40,
  cancelled: 40,
  abandoned: 40,
  succeeded: 50,
};

const REFUND_STATUS_WEIGHT: Record<string, number> = {
  pending: 10,
  received: 20,
  accepted: 30,
  settled: 40,
  failed: 50,
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIso(value?: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

function shouldApplyPaymentStatusTransition(
  currentStatus: InternalPaymentStatus,
  nextStatus: InternalPaymentStatus,
  currentEventCreatedAt: string | null,
  nextEventCreatedAt: string | null
) {
  if (currentStatus === nextStatus) return true;
  if (currentStatus === "succeeded" && nextStatus !== "succeeded") return false;

  const currentEventAt = toIso(currentEventCreatedAt);
  const nextEventAt = toIso(nextEventCreatedAt);
  if (currentEventAt && nextEventAt && Date.parse(nextEventAt) < Date.parse(currentEventAt)) {
    if (nextStatus === "succeeded" && currentStatus !== "succeeded") return true;
    return false;
  }

  if (isTerminalFailedPaymentStatus(currentStatus) && isPendingPaymentStatus(nextStatus)) {
    return false;
  }

  return PAYMENT_STATUS_WEIGHT[nextStatus] >= PAYMENT_STATUS_WEIGHT[currentStatus];
}

function normalizeFulfillmentStatus(status: string | null | undefined) {
  if (!status) return "";
  return status.trim().toLowerCase();
}

function deriveOrderStatusForPayment(
  order: OrderRow,
  nextPaymentStatus: InternalPaymentStatus
): Pick<OrderRow, "status" | "fulfillment_status" | "payment_status" | "paid_at"> {
  const existingOrderStatus = normalizeFulfillmentStatus(order.status);
  const existingFulfillment = normalizeFulfillmentStatus(order.fulfillment_status);
  const existingPaidAt = order.paid_at;

  const immutableFulfillmentStates = new Set(["packed", "shipped", "delivered", "refunded"]);

  if (isSuccessfulPaymentStatus(nextPaymentStatus)) {
    return {
      status: immutableFulfillmentStates.has(existingOrderStatus) ? existingOrderStatus : "paid",
      fulfillment_status: immutableFulfillmentStates.has(existingFulfillment)
        ? existingFulfillment
        : "paid",
      payment_status: "succeeded",
      paid_at: existingPaidAt ?? new Date().toISOString(),
    };
  }

  if (isTerminalFailedPaymentStatus(nextPaymentStatus)) {
    return {
      status: immutableFulfillmentStates.has(existingOrderStatus) ? existingOrderStatus : "failed",
      fulfillment_status: immutableFulfillmentStates.has(existingFulfillment)
        ? existingFulfillment
        : "payment_failed",
      payment_status: nextPaymentStatus,
      paid_at: existingPaidAt,
    };
  }

  return {
    status: immutableFulfillmentStates.has(existingOrderStatus) ? existingOrderStatus : "pending",
    fulfillment_status: immutableFulfillmentStates.has(existingFulfillment)
      ? existingFulfillment
      : "pending_payment",
    payment_status: nextPaymentStatus,
    paid_at: existingPaidAt,
  };
}

async function getOrderItemReservations(supabase: SupabaseClient, orderId: string) {
  const { data, error } = await supabase
    .from("order_items")
    .select("product_id, variant_id, quantity")
    .eq("order_id", orderId);
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    product_id: string | null;
    variant_id: string | null;
    quantity: number;
  }>;

  const aggregate = new Map<string, { product_id: string; variant_id: string | null; quantity: number }>();
  for (const row of rows) {
    if (!row.product_id) continue;
    const quantity = Math.max(0, Math.floor(Number(row.quantity) || 0));
    if (quantity < 1) continue;
    const key = row.variant_id ? `v:${row.variant_id}` : `p:${row.product_id}`;
    const existing = aggregate.get(key);
    if (existing) {
      existing.quantity += quantity;
      continue;
    }
    aggregate.set(key, {
      product_id: row.product_id,
      variant_id: row.variant_id ?? null,
      quantity,
    });
  }
  return Array.from(aggregate.values());
}

function reservationsFromResolvedItems(items: ResolvedCheckoutItem[]) {
  const aggregate = new Map<string, { product_id: string; variant_id: string | null; quantity: number }>();
  for (const line of items) {
    const variantId = line.variant?.id ?? null;
    const key = variantId ? `v:${variantId}` : `p:${line.product.id}`;
    const existing = aggregate.get(key);
    if (existing) {
      existing.quantity += line.requestedQuantity;
      continue;
    }
    aggregate.set(key, {
      product_id: line.product.id,
      variant_id: variantId,
      quantity: line.requestedQuantity,
    });
  }
  return Array.from(aggregate.values());
}

/**
 * Restores stock once for an order. `restore_order_inventory` locks the order
 * row and returns without changing stock when `inventory_reserved` is already
 * false, so duplicate and overlapping calls are safe.
 */
export async function releaseOrderReservation(
  supabase: SupabaseClient,
  orderId: string,
  fallbackItems?: ResolvedCheckoutItem[]
) {
  let reservations = await getOrderItemReservations(supabase, orderId);
  if (!reservations.length && fallbackItems?.length) {
    reservations = reservationsFromResolvedItems(fallbackItems);
  }
  if (!reservations.length) {
    const { data, error } = await supabase
      .from("orders")
      .select("inventory_reserved")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (data?.inventory_reserved) {
      throw new Error("Order holds a reservation but has no items to restore");
    }
    return { released: false, alreadyReleased: true };
  }

  const { data, error } = await supabase.rpc("restore_order_inventory", {
    p_order_id: orderId,
    order_items: reservations as unknown as Json,
  });
  if (error) throw error;

  const result = (data ?? []) as Array<{ success: boolean; was_reserved?: boolean; message: string }>;
  const failed = result.find((entry) => !entry.success);
  if (failed) throw new Error(failed.message || "Failed to restore inventory");
  const released = Boolean(result[0]?.was_reserved);
  return { released, alreadyReleased: !released };
}

async function reserveInventoryForReleasedOrder(supabase: SupabaseClient, orderId: string) {
  const reservations = await getOrderItemReservations(supabase, orderId);
  if (!reservations.length) return { reserved: false };

  const { data, error } = await supabase.rpc("reserve_order_inventory", {
    p_order_id: orderId,
    order_items: reservations as unknown as Json,
  });
  if (error) {
    if (isStockUnavailable(error.message)) return { reserved: false };
    throw error;
  }

  const result = (data ?? []) as Array<{ success: boolean; message: string }>;
  const failed = result.find((entry) => !entry.success);
  if (failed) {
    if (isStockUnavailable(failed.message)) return { reserved: false };
    throw new Error(failed.message || "Inventory reservation failed");
  }
  return { reserved: true };
}

function isStockUnavailable(message: string | undefined) {
  return /stock|unavailable/i.test(message ?? "");
}

async function sendOrderEmailsIfNeeded(supabase: SupabaseClient, orderId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, customer_name, customer_email, subtotal_amount, shipping_amount, total_amount, currency, shipping_address, confirmation_email_sent_at, order_items(product_name, quantity, variant_size, variant_material, price_at_purchase)"
    )
    .eq("id", orderId)
    .single();
  if (error) throw error;

  const order = data as unknown as OrderEmailRow;
  if (order.confirmation_email_sent_at || !order.customer_email) {
    return;
  }

  const shippingAddress = order.shipping_address ?? {};
  const address =
    typeof shippingAddress.address === "string" ? shippingAddress.address : "Address unavailable";
  const apartment = typeof shippingAddress.apartment === "string" ? shippingAddress.apartment : "";
  const city = typeof shippingAddress.city === "string" ? shippingAddress.city : "";
  const region = typeof shippingAddress.region === "string" ? shippingAddress.region : "";
  const country = typeof shippingAddress.country === "string" ? shippingAddress.country : "";

  await sendOrderEmails({
    orderId: order.id,
    customerName: order.customer_name ?? "Customer",
    customerEmail: order.customer_email,
    items: (order.order_items ?? []).map((item) => ({
      name:
        item.product_name +
        ((item.variant_size || item.variant_material)
          ? ` (${[item.variant_size, item.variant_material].filter(Boolean).join(" / ")})`
          : ""),
      quantity: item.quantity,
      price: Number(item.price_at_purchase ?? 0),
    })),
    subtotal:
      toNumber(order.subtotal_amount) ||
      (order.order_items ?? []).reduce(
        (sum, item) => sum + Number(item.price_at_purchase || 0) * Number(item.quantity || 0),
        0
      ),
    shipping: toNumber(order.shipping_amount),
    total: toNumber(order.total_amount),
    paymentMethod: "airwallex",
    currency: normalizeCurrency(order.currency ?? "USD"),
    shippingAddress: {
      address,
      apartment,
      city,
      region,
      country,
    },
  });

  const { error: updateError } = await supabase
    .from("orders")
    .update({ confirmation_email_sent_at: new Date().toISOString() })
    .eq("id", order.id)
    .is("confirmation_email_sent_at", null);
  if (updateError) throw updateError;
}

export async function upsertAirwallexPaymentIntent(
  supabase: SupabaseClient,
  input: {
    orderId: string;
    requestId: string;
    intent: AirwallexPaymentIntent;
  }
) {
  const now = new Date().toISOString();
  const amount = toNumber(input.intent.amount);
  const normalizedStatus = normalizeAirwallexPaymentStatus(input.intent.status);

  const payload = {
    order_id: input.orderId,
    provider: AIRWALLEX_PROVIDER,
    provider_payment_intent_id: input.intent.id,
    provider_request_id: input.intent.request_id ?? input.requestId,
    amount,
    currency: String(input.intent.currency || "USD").toUpperCase(),
    status: normalizedStatus,
    metadata: input.intent as unknown as Json,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("payments")
    .upsert(payload, { onConflict: "provider,provider_payment_intent_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as PaymentRow;
}

export async function applyAirwallexPaymentIntentStatus(
  supabase: SupabaseClient,
  input: {
    paymentIntentId: string;
    nextStatus: InternalPaymentStatus;
    providerEventId?: string | null;
    providerEventCreatedAt?: string | null;
    force?: boolean;
  }
) {
  const { data: paymentData, error: paymentError } = await supabase
    .from("payments")
    .select(
      "id, order_id, provider, provider_payment_intent_id, provider_request_id, status, amount, currency, last_event_created_at"
    )
    .eq("provider", AIRWALLEX_PROVIDER)
    .eq("provider_payment_intent_id", input.paymentIntentId)
    .maybeSingle();
  if (paymentError) throw paymentError;

  if (!paymentData) {
    return { applied: false, reason: "payment_not_found" as const };
  }

  const payment = paymentData as unknown as PaymentRow;
  const currentStatus = normalizeAirwallexPaymentStatus(payment.status);
  const shouldApply =
    input.force ||
    shouldApplyPaymentStatusTransition(
      currentStatus,
      input.nextStatus,
      payment.last_event_created_at,
      input.providerEventCreatedAt ?? null
    );

  if (!shouldApply) {
    return { applied: false, reason: "ignored_transition" as const, orderId: payment.order_id };
  }

  const now = new Date().toISOString();

  const { error: paymentUpdateError } = await supabase
    .from("payments")
    .update({
      status: input.nextStatus,
      last_event_id: input.providerEventId ?? null,
      last_event_created_at: input.providerEventCreatedAt ?? now,
      paid_at: isSuccessfulPaymentStatus(input.nextStatus) ? now : null,
      updated_at: now,
    })
    .eq("id", payment.id);
  if (paymentUpdateError) throw paymentUpdateError;

  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, status, fulfillment_status, payment_status, inventory_reserved, paid_at, updated_at, total_amount, refunded_amount, customer_email, currency"
    )
    .eq("id", payment.order_id)
    .single();
  if (orderError) throw orderError;

  const order = orderData as unknown as OrderRow & {
    customer_email?: string | null;
    currency?: string | null;
  };

  let inventoryException = false;
  if (isSuccessfulPaymentStatus(input.nextStatus) && !order.inventory_reserved) {
    if (order.status === "inventory_exception") {
      inventoryException = true;
    } else {
      const reservation = await reserveInventoryForReleasedOrder(supabase, order.id);
      inventoryException = !reservation.reserved;
    }
  }

  const statusUpdate = inventoryException
    ? {
        status: "inventory_exception",
        fulfillment_status: "inventory_exception",
        payment_status: "succeeded" as const,
        paid_at: order.paid_at ?? now,
      }
    : deriveOrderStatusForPayment(order, input.nextStatus);

  const { error: orderUpdateError } = await supabase
    .from("orders")
    .update({
      payment_provider: AIRWALLEX_PROVIDER,
      payment_status: statusUpdate.payment_status,
      status: statusUpdate.status,
      fulfillment_status: statusUpdate.fulfillment_status,
      paid_at: statusUpdate.paid_at,
      updated_at: now,
    })
    .eq("id", order.id);
  if (orderUpdateError) throw orderUpdateError;

  if (isTerminalFailedPaymentStatus(input.nextStatus) && order.inventory_reserved) {
    await releaseOrderReservation(supabase, order.id);
  }

  if (inventoryException) {
    if (order.status !== "inventory_exception") {
      await sendInventoryExceptionAlert({
        orderId: order.id,
        customerEmail: order.customer_email,
        totalAmount: toNumber(order.total_amount),
        currency: order.currency,
      });
    }
    return { applied: true, orderId: order.id, inventoryException: true as const };
  }

  if (isSuccessfulPaymentStatus(input.nextStatus)) {
    await sendOrderEmailsIfNeeded(supabase, order.id);
  }

  return { applied: true, orderId: order.id };
}

function shouldApplyRefundTransition(currentStatus: string | null, nextStatus: string) {
  if (!currentStatus) return true;
  const current = currentStatus.toLowerCase();
  if (current === nextStatus) return true;
  if (current === "settled" && nextStatus !== "settled") return false;
  return (REFUND_STATUS_WEIGHT[nextStatus] ?? 0) >= (REFUND_STATUS_WEIGHT[current] ?? 0);
}

function mapRefundStatusFromEventName(eventName: string) {
  switch (eventName) {
    case "refund.received":
      return "received";
    case "refund.accepted":
      return "accepted";
    case "refund.settled":
      return "settled";
    case "refund.failed":
      return "failed";
    default:
      return "pending";
  }
}

export async function applyAirwallexRefundEvent(
  supabase: SupabaseClient,
  input: {
    eventName: string;
    refundObject: Record<string, unknown>;
    providerEventId?: string | null;
    providerEventCreatedAt?: string | null;
  }
) {
  const refundId = typeof input.refundObject.id === "string" ? input.refundObject.id : null;
  const paymentIntentId =
    typeof input.refundObject.payment_intent_id === "string"
      ? input.refundObject.payment_intent_id
      : null;
  if (!refundId || !paymentIntentId) {
    return { applied: false, reason: "missing_refund_identifiers" as const };
  }

  const { data: paymentData, error: paymentError } = await supabase
    .from("payments")
    .select("id, order_id, currency")
    .eq("provider", AIRWALLEX_PROVIDER)
    .eq("provider_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (paymentError) throw paymentError;
  if (!paymentData) {
    return { applied: false, reason: "payment_not_found" as const };
  }

  const statusFromPayload =
    typeof input.refundObject.status === "string" ? input.refundObject.status : null;
  const normalizedRefundStatus = normalizeAirwallexRefundStatus(statusFromPayload).toLowerCase();
  const eventStatus = mapRefundStatusFromEventName(input.eventName);
  const nextStatus =
    normalizedRefundStatus !== "pending" ? normalizedRefundStatus : eventStatus;
  const now = new Date().toISOString();

  const { data: existingRefund, error: existingRefundError } = await supabase
    .from("payment_refunds")
    .select("id, status, settled_at")
    .eq("provider", AIRWALLEX_PROVIDER)
    .eq("provider_refund_id", refundId)
    .maybeSingle();
  if (existingRefundError) throw existingRefundError;

  const currentStatus = existingRefund?.status ?? null;
  if (!shouldApplyRefundTransition(currentStatus, nextStatus)) {
    return { applied: false, reason: "ignored_transition" as const };
  }

  const refundAmount = toNumber(input.refundObject.amount);
  const currency =
    typeof input.refundObject.currency === "string"
      ? input.refundObject.currency
      : String(paymentData.currency ?? "USD");

  const payload = {
    payment_id: paymentData.id,
    order_id: paymentData.order_id,
    provider: AIRWALLEX_PROVIDER,
    provider_refund_id: refundId,
    amount: refundAmount,
    currency: currency.toUpperCase(),
    reason: typeof input.refundObject.reason === "string" ? input.refundObject.reason : null,
    status: nextStatus,
    settled_at: nextStatus === "settled" ? now : existingRefund?.settled_at ?? null,
    metadata: input.refundObject as unknown as Json,
    updated_at: now,
  };

  const { error: upsertError } = await supabase
    .from("payment_refunds")
    .upsert(payload, { onConflict: "provider,provider_refund_id" });
  if (upsertError) throw upsertError;

  const transitionedToSettled = nextStatus === "settled" && currentStatus !== "settled";
  if (transitionedToSettled) {
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("id, total_amount, refunded_amount")
      .eq("id", paymentData.order_id)
      .single();
    if (orderError) throw orderError;

    const totalAmount = toNumber(orderData.total_amount);
    const currentRefundedAmount = toNumber(orderData.refunded_amount);
    const nextRefundedAmount = Math.min(totalAmount, currentRefundedAmount + refundAmount);
    const fullyRefunded = totalAmount > 0 && nextRefundedAmount >= totalAmount;

    const { error: updateOrderError } = await supabase
      .from("orders")
      .update({
        refunded_amount: nextRefundedAmount,
        status: fullyRefunded ? "refunded" : "paid",
        fulfillment_status: fullyRefunded ? "refunded" : "paid",
        updated_at: now,
      })
      .eq("id", paymentData.order_id);
    if (updateOrderError) throw updateOrderError;

    const { error: insertLegacyRefundError } = await supabase.from("order_refunds").insert({
      order_id: paymentData.order_id,
      amount: refundAmount,
      reason: typeof input.refundObject.reason === "string" ? input.refundObject.reason : null,
    });
    if (insertLegacyRefundError) throw insertLegacyRefundError;
  }

  return { applied: true, orderId: paymentData.order_id };
}

const PENDING_PAYMENT_STATUSES = [
  "requires_payment_method",
  "requires_customer_action",
  "pending",
  "pending_review",
  "unknown",
];

const CANCELLABLE_INTENT_STATUSES = new Set<InternalPaymentStatus>([
  "requires_payment_method",
  "requires_customer_action",
]);

const STALE_ORDER_COLUMNS =
  "id, status, payment_status, inventory_reserved, payment_reference, created_at";

interface StaleOrderRow {
  id: string;
  status: string | null;
  payment_status: string | null;
  inventory_reserved: boolean | null;
  payment_reference: string | null;
  created_at?: string | null;
}

interface StalePaymentRow {
  id: string;
  status: string;
  provider_payment_intent_id: string;
}

export interface ReservationReleaseSummary {
  examined: number;
  released: number;
  paid: number;
  skipped: number;
  errors: Array<{ orderId: string; message: string }>;
}

export async function releaseExpiredAirwallexReservations(
  supabase: SupabaseClient,
  olderThanMinutes = 75
): Promise<ReservationReleaseSummary> {
  const summary: ReservationReleaseSummary = {
    examined: 0,
    released: 0,
    paid: 0,
    skipped: 0,
    errors: [],
  };
  const orders = await selectReservationReleaseCandidates(supabase, olderThanMinutes);

  for (const order of orders) {
    summary.examined += 1;
    try {
      const outcome = await reconcileStaleReservation(supabase, order);
      if (outcome === "released") summary.released += 1;
      else if (outcome === "paid") summary.paid += 1;
      else summary.skipped += 1;
    } catch (error) {
      summary.skipped += 1;
      summary.errors.push({
        orderId: order.id,
        message: error instanceof Error ? error.message : "Reservation release failed",
      });
      console.error("[reservation-release]", order.id, error);
    }
  }

  return summary;
}

async function selectReservationReleaseCandidates(supabase: SupabaseClient, olderThanMinutes: number) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();
  const failed = await supabase
    .from("orders")
    .select(STALE_ORDER_COLUMNS)
    .eq("payment_provider", AIRWALLEX_PROVIDER)
    .eq("inventory_reserved", true)
    .eq("status", "failed")
    .neq("payment_status", "succeeded")
    .limit(50);
  if (failed.error) throw failed.error;

  const pending = await supabase
    .from("orders")
    .select(STALE_ORDER_COLUMNS)
    .eq("payment_provider", AIRWALLEX_PROVIDER)
    .eq("inventory_reserved", true)
    .in("payment_status", PENDING_PAYMENT_STATUSES)
    .lt("created_at", cutoff)
    .limit(50);
  if (pending.error) throw pending.error;

  const byId = new Map<string, StaleOrderRow>();
  for (const row of [...(failed.data ?? []), ...(pending.data ?? [])] as StaleOrderRow[]) {
    byId.set(row.id, row);
  }
  return Array.from(byId.values());
}

async function reconcileStaleReservation(
  supabase: SupabaseClient,
  order: StaleOrderRow
): Promise<"released" | "paid" | "skipped"> {
  const fresh = await readStaleOrder(supabase, order.id);
  if (!fresh || fresh.inventory_reserved !== true || fresh.payment_status === "succeeded") {
    return fresh?.payment_status === "succeeded" ? "paid" : "skipped";
  }

  const payment = await loadAirwallexPayment(supabase, order.id);
  const intentId = payment?.provider_payment_intent_id || fresh.payment_reference || null;
  if (intentId) {
    const intent = await retrieveAirwallexPaymentIntent(intentId);
    const decision = await decideStaleIntent(supabase, fresh, intent);
    if (decision !== "release") return decision;
  }

  const latest = await readStaleOrder(supabase, order.id);
  if (!latest || latest.inventory_reserved !== true || latest.payment_status === "succeeded") {
    return latest?.payment_status === "succeeded" ? "paid" : "skipped";
  }

  // restore_order_inventory is idempotent via inventory_reserved. A payment can
  // still commit after the Airwallex read and before this returns.
  await releaseOrderReservation(supabase, order.id);

  const settled = await readStaleOrder(supabase, order.id);
  if (settled?.payment_status === "succeeded") {
    const recoverId =
      intentId ||
      settled.payment_reference ||
      (await loadAirwallexPayment(supabase, order.id))?.provider_payment_intent_id;
    if (!recoverId) {
      throw new Error("Paid during release but the order has no payment intent");
    }
    const recovered = await recordSucceededIntent(supabase, {
      id: recoverId,
      status: "SUCCEEDED",
      amount: 0,
      currency: "USD",
      updated_at: new Date().toISOString(),
    });
    if (!recovered) {
      throw new Error("Could not reconcile a payment that succeeded during release");
    }
    return "paid";
  }

  const now = new Date().toISOString();
  const paymentStatus = normalizeAirwallexPaymentStatus(latest.payment_status);
  if (isPendingPaymentStatus(paymentStatus) || (latest.status ?? "").toLowerCase() !== "failed") {
    const { error: orderError } = await supabase
      .from("orders")
      .update({
        payment_status: "abandoned",
        status: "failed",
        fulfillment_status: "payment_failed",
        updated_at: now,
      })
      .eq("id", order.id)
      .neq("payment_status", "succeeded");
    if (orderError) throw orderError;
  }

  if (payment && payment.status !== "succeeded") {
    const { error: paymentError } = await supabase
      .from("payments")
      .update({ status: "cancelled", updated_at: now })
      .eq("id", payment.id)
      .neq("status", "succeeded");
    if (paymentError) throw paymentError;
  }

  return "released";
}

async function decideStaleIntent(
  supabase: SupabaseClient,
  order: StaleOrderRow,
  intent: AirwallexPaymentIntent
): Promise<"paid" | "skipped" | "release"> {
  let status = normalizeAirwallexPaymentStatus(intent.status);
  if (status === "succeeded") {
    return (await recordSucceededIntent(supabase, intent)) ? "paid" : "skipped";
  }

  if (CANCELLABLE_INTENT_STATUSES.has(status)) {
    try {
      const cancelled = await cancelAirwallexPaymentIntent(intent.id, randomUUID());
      status = normalizeAirwallexPaymentStatus(cancelled.status);
    } catch (error) {
      let latest: AirwallexPaymentIntent;
      try {
        latest = await retrieveAirwallexPaymentIntent(intent.id);
      } catch (retrieveError) {
        console.error("[reservation-release] could not re-check intent after cancel", order.id, retrieveError);
        throw error;
      }
      status = normalizeAirwallexPaymentStatus(latest.status);
      if (status === "succeeded") {
        return (await recordSucceededIntent(supabase, latest)) ? "paid" : "skipped";
      }
      if (!isTerminalFailedPaymentStatus(status)) {
        console.error("[reservation-release] left stock held; intent is not cancellable", order.id, status);
        return "skipped";
      }
    }
    if (status === "succeeded") {
      return (await recordSucceededIntent(supabase, intent)) ? "paid" : "skipped";
    }
    if (!isTerminalFailedPaymentStatus(status)) {
      console.error("[reservation-release] left stock held after cancel", order.id, status);
      return "skipped";
    }
    return "release";
  }

  if (!isTerminalFailedPaymentStatus(status)) {
    console.error("[reservation-release] left stock held; intent is still in progress", order.id, status);
    return "skipped";
  }
  return "release";
}

async function recordSucceededIntent(supabase: SupabaseClient, intent: AirwallexPaymentIntent) {
  const result = await applyAirwallexPaymentIntentStatus(supabase, {
    paymentIntentId: intent.id,
    nextStatus: "succeeded",
    providerEventCreatedAt: intent.updated_at ?? null,
  });
  if (!result.applied) {
    console.error("[reservation-release] succeeded intent was not applied", intent.id, result.reason);
    return false;
  }
  return true;
}

async function readStaleOrder(supabase: SupabaseClient, orderId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("id, status, payment_status, inventory_reserved, payment_reference")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as StaleOrderRow | null;
}

async function loadAirwallexPayment(supabase: SupabaseClient, orderId: string) {
  const { data, error } = await supabase
    .from("payments")
    .select("id, status, provider_payment_intent_id")
    .eq("order_id", orderId)
    .eq("provider", AIRWALLEX_PROVIDER)
    .limit(1);
  if (error) throw error;
  const rows = (data ?? []) as StalePaymentRow[];
  return rows[0] ?? null;
}
