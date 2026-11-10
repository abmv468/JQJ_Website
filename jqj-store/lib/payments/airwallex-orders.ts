import type { SupabaseClient } from "@supabase/supabase-js";
import { sendOrderEmails } from "@/lib/email";
import { normalizeCurrency } from "@/lib/currency";
import {
  AIRWALLEX_PROVIDER,
  isPendingPaymentStatus,
  isSuccessfulPaymentStatus,
  isTerminalFailedPaymentStatus,
  normalizeAirwallexPaymentStatus,
  normalizeAirwallexRefundStatus,
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

async function restoreInventoryForOrder(supabase: SupabaseClient, orderId: string) {
  const reservations = await getOrderItemReservations(supabase, orderId);
  if (!reservations.length) return;

  const { data, error } = await supabase.rpc("restore_order_inventory", {
    p_order_id: orderId,
    order_items: reservations as unknown as Json,
  });
  if (error) throw error;

  const result = (data ?? []) as Array<{ success: boolean; message: string }>;
  const failed = result.find((entry) => !entry.success);
  if (failed) throw new Error(failed.message || "Failed to restore inventory");
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

export async function findAirwallexPaymentByIntent(
  supabase: SupabaseClient,
  paymentIntentId: string
) {
  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, order_id, provider, provider_payment_intent_id, provider_request_id, status, amount, currency, last_event_created_at"
    )
    .eq("provider", AIRWALLEX_PROVIDER)
    .eq("provider_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (error) throw error;
  return (data as PaymentRow | null) ?? null;
}

const PERSISTED_INTENT_FIELDS = [
  "id",
  "request_id",
  "status",
  "amount",
  "currency",
  "merchant_order_id",
  "created_at",
  "updated_at",
  "captured_amount",
  "original_amount",
  "original_currency",
  "descriptor",
] as const;

function persistedScalar(value: unknown): Json | undefined {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function persistedPaymentAttempt(value: unknown): { [key: string]: Json } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const attempt = value as Record<string, unknown>;
  const persisted: { [key: string]: Json } = {};

  const status = persistedScalar(attempt.status);
  if (status !== undefined) persisted.status = status;

  const methodValue = attempt.payment_method;
  if (methodValue && typeof methodValue === "object" && !Array.isArray(methodValue)) {
    const method = methodValue as Record<string, unknown>;
    const persistedMethod: { [key: string]: Json } = {};
    const type = persistedScalar(method.type);
    if (type !== undefined) persistedMethod.type = type;

    const cardValue = method.card;
    if (cardValue && typeof cardValue === "object" && !Array.isArray(cardValue)) {
      const card = cardValue as Record<string, unknown>;
      const persistedCard: { [key: string]: Json } = {};
      const brand = persistedScalar(card.brand);
      const last4 = persistedScalar(card.last4);
      if (brand !== undefined) persistedCard.brand = brand;
      if (last4 !== undefined) persistedCard.last4 = last4;
      if (Object.keys(persistedCard).length > 0) persistedMethod.card = persistedCard;
    }

    if (Object.keys(persistedMethod).length > 0) persisted.payment_method = persistedMethod;
  }

  return persisted;
}

export function toPersistedIntent(intent: AirwallexPaymentIntent): Json {
  const persisted: { [key: string]: Json } = {};
  for (const field of PERSISTED_INTENT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(intent, field)) continue;
    const value = persistedScalar(intent[field]);
    if (value !== undefined) persisted[field] = value;
  }

  if (Object.prototype.hasOwnProperty.call(intent, "latest_payment_attempt")) {
    const attempt = persistedPaymentAttempt(intent.latest_payment_attempt);
    if (attempt) persisted.latest_payment_attempt = attempt;
  }

  return persisted;
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
  const existing = await findAirwallexPaymentByIntent(supabase, input.intent.id);
  if (
    existing &&
    (existing.order_id !== input.orderId ||
      isSuccessfulPaymentStatus(normalizeAirwallexPaymentStatus(existing.status)))
  ) {
    // Keep the original order and a paid row. A second checkout must not move the intent.
    return existing;
  }

  const payload: {
    order_id: string;
    provider: typeof AIRWALLEX_PROVIDER;
    provider_payment_intent_id: string;
    provider_request_id: string;
    amount: number;
    currency: string;
    metadata: Json;
    updated_at: string;
    status?: InternalPaymentStatus;
  } = {
    order_id: input.orderId,
    provider: AIRWALLEX_PROVIDER,
    provider_payment_intent_id: input.intent.id,
    provider_request_id: input.intent.request_id ?? input.requestId,
    amount,
    currency: String(input.intent.currency || "USD").toUpperCase(),
    metadata: toPersistedIntent(input.intent),
    updated_at: now,
  };
  // Succeeded is claimed by applyAirwallexPaymentIntentStatus, so a duplicate
  // return cannot upsert the row straight to paid and skip the conditional update.
  if (!isSuccessfulPaymentStatus(normalizedStatus)) {
    payload.status = normalizedStatus;
  }

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

  if (isSuccessfulPaymentStatus(currentStatus)) {
    if (!isSuccessfulPaymentStatus(input.nextStatus)) {
      return { applied: false, reason: "already_succeeded" as const, orderId: payment.order_id };
    }
    const { data: paidOrder, error: paidOrderError } = await supabase
      .from("orders")
      .select("payment_status")
      .eq("id", payment.order_id)
      .maybeSingle();
    if (paidOrderError) throw paidOrderError;
    if (paidOrder?.payment_status === "succeeded") {
      return { applied: false, reason: "already_succeeded" as const, orderId: payment.order_id };
    }
  }

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
  const claimingPaid = isSuccessfulPaymentStatus(input.nextStatus);

  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, status, fulfillment_status, payment_status, inventory_reserved, paid_at, updated_at, total_amount, refunded_amount"
    )
    .eq("id", payment.order_id)
    .single();
  if (orderError) throw orderError;

  const order = orderData as unknown as OrderRow;
  const statusUpdate = deriveOrderStatusForPayment(order, input.nextStatus);
  const orderPatch = {
    payment_provider: AIRWALLEX_PROVIDER,
    payment_status: statusUpdate.payment_status,
    status: statusUpdate.status,
    fulfillment_status: statusUpdate.fulfillment_status,
    paid_at: statusUpdate.paid_at,
    updated_at: now,
  };

  if (claimingPaid) {
    // The order claim is the gate. NULL payment_status is unpaid in Postgres,
    // so `<> 'succeeded'` alone would skip the row and leave it stuck.
    const { data: claimedOrder, error: orderUpdateError } = await supabase
      .from("orders")
      .update(orderPatch)
      .eq("id", order.id)
      .or("payment_status.is.null,payment_status.neq.succeeded")
      .select("id")
      .maybeSingle();
    if (orderUpdateError) throw orderUpdateError;

    if (!claimedOrder) {
      const { data: currentOrder, error: rereadError } = await supabase
        .from("orders")
        .select("payment_status")
        .eq("id", order.id)
        .maybeSingle();
      if (rereadError) throw rereadError;
      if (currentOrder?.payment_status !== "succeeded") {
        console.error("[airwallex-orders] payment succeeded but the order was not marked paid", {
          orderId: order.id,
          paymentIntentId: input.paymentIntentId,
        });
        return { applied: false, reason: "order_not_claimed" as const, orderId: order.id };
      }
    }

    if (!isSuccessfulPaymentStatus(currentStatus)) {
      const { error: paymentUpdateError } = await supabase
        .from("payments")
        .update({
          status: input.nextStatus,
          last_event_id: input.providerEventId ?? null,
          last_event_created_at: input.providerEventCreatedAt ?? now,
          paid_at: now,
          updated_at: now,
        })
        .eq("id", payment.id)
        .neq("status", "succeeded");
      if (paymentUpdateError) throw paymentUpdateError;
    }

    await sendOrderEmailsIfNeeded(supabase, order.id);
    return { applied: true, orderId: order.id };
  }

  const { error: paymentUpdateError } = await supabase
    .from("payments")
    .update({
      status: input.nextStatus,
      last_event_id: input.providerEventId ?? null,
      last_event_created_at: input.providerEventCreatedAt ?? now,
      paid_at: null,
      updated_at: now,
    })
    .eq("id", payment.id)
    .neq("status", "succeeded");
  if (paymentUpdateError) throw paymentUpdateError;

  const { data: guardedOrder, error: orderUpdateError } = await supabase
    .from("orders")
    .update(orderPatch)
    .eq("id", order.id)
    .or("payment_status.is.null,payment_status.neq.succeeded")
    .select("id")
    .maybeSingle();
  if (orderUpdateError) throw orderUpdateError;

  if (!guardedOrder) {
    const { data: currentOrder, error: rereadError } = await supabase
      .from("orders")
      .select("payment_status")
      .eq("id", order.id)
      .maybeSingle();
    if (rereadError) throw rereadError;
    if (currentOrder?.payment_status === "succeeded" || order.payment_status === "succeeded") {
      const { error: reconcileError } = await supabase
        .from("payments")
        .update({
          status: "succeeded",
          last_event_id: input.providerEventId ?? null,
          last_event_created_at: input.providerEventCreatedAt ?? now,
          paid_at: order.paid_at ?? now,
          updated_at: now,
        })
        .eq("id", payment.id)
        .neq("status", "succeeded");
      if (reconcileError) throw reconcileError;
      return { applied: true, orderId: order.id };
    }
  }

  if (guardedOrder && isTerminalFailedPaymentStatus(input.nextStatus) && order.inventory_reserved) {
    await restoreInventoryForOrder(supabase, order.id);
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

const PERSISTED_REFUND_FIELDS = [
  "id",
  "request_id",
  "payment_intent_id",
  "amount",
  "currency",
  "status",
  "reason",
  "created_at",
  "updated_at",
] as const;

export function toPersistedRefund(refund: Record<string, unknown>): Json {
  const persisted: { [key: string]: Json } = {};
  for (const field of PERSISTED_REFUND_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(refund, field)) continue;
    const value = persistedScalar(refund[field]);
    if (value !== undefined) persisted[field] = value;
  }
  return persisted;
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
    metadata: toPersistedRefund(input.refundObject),
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

export async function releaseExpiredAirwallexReservations(
  supabase: SupabaseClient,
  olderThanMinutes = 75
) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();
  const pendingStatuses = [
    "requires_payment_method",
    "requires_customer_action",
    "pending",
    "pending_review",
    "unknown",
  ];

  const { data, error } = await supabase
    .from("orders")
    .select("id, payment_status, inventory_reserved")
    .eq("payment_provider", AIRWALLEX_PROVIDER)
    .eq("inventory_reserved", true)
    .in("payment_status", pendingStatuses)
    .lt("created_at", cutoff)
    .limit(50);
  if (error) throw error;

  const staleOrders = (data ?? []) as Array<{ id: string; inventory_reserved: boolean }>;
  for (const order of staleOrders) {
    if (!order.inventory_reserved) continue;
    // Claim the row before restore. restore_order_inventory returns no stock once
    // inventory_reserved is false, so this update leaves that flag set and the
    // restore below clears it.
    const { data: released, error: updateError } = await supabase
      .from("orders")
      .update({
        payment_status: "abandoned",
        status: "failed",
        fulfillment_status: "payment_failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("inventory_reserved", true)
      .in("payment_status", pendingStatuses)
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!released) continue;
    await restoreInventoryForOrder(supabase, order.id);
  }
}
