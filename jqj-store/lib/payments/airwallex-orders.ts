import type { SupabaseClient } from "@supabase/supabase-js";
import { sendOrderEmails } from "@/lib/email";
import { normalizeCurrency } from "@/lib/currency";
import { reserveOrderInventory } from "@/lib/inventory";
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
  sales_channel: string | null;
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

/**
 * Stable event for BE-018's unmatched-payment alert. The payload is the order
 * id, the payment intent id, and the stock shortfall. It has no customer PII
 * and no secrets.
 */
export const PAYMENT_AFTER_EXPIRY_UNFULFILLED_EVENT =
  "airwallex.payment_after_expiry_unfulfilled";

/**
 * Stable event for BE-018. A paid compare-and-set lost the row, so the webhook
 * must fail and Airwallex must redeliver. The payload is the order id only.
 */
export const PAID_CLAIM_LOST_EVENT = "airwallex.paid_claim_lost";

export interface PaymentAfterExpiryShortfall {
  productId: string;
  variantId: string | null;
  requested: number;
  available: number;
}

export function reportPaymentAfterExpiryUnfulfilled(input: {
  orderId: string;
  paymentIntentId: string;
  shortfall: PaymentAfterExpiryShortfall[];
}) {
  console.error(
    JSON.stringify({
      tag: "jqd_alert",
      event: PAYMENT_AFTER_EXPIRY_UNFULFILLED_EVENT,
      orderId: input.orderId,
    })
  );
}

export function reportPaidClaimLost(orderId: string) {
  console.error("[airwallex-orders] paid_claim_lost", {
    event: PAID_CLAIM_LOST_EVENT,
    orderId,
  });
}

/** Stable event for a terminal payment on a cancelled or test order. Ids only. */
export const PAYMENT_ON_PROTECTED_ORDER_EVENT = "airwallex.payment_on_protected_order";
export const PROTECTED_ORDER_ALERT_EVENT = "payment_on_protected_order";

export type ProtectedOrderReason = "cancelled" | "test";

export function isProtectedOrder(order: {
  status?: string | null;
  sales_channel?: string | null;
}) {
  const status = (order.status ?? "").trim().toLowerCase();
  const channel = (order.sales_channel ?? "").trim().toLowerCase();
  return status === "cancelled" || channel === "test";
}

export function protectedOrderReason(order: {
  status?: string | null;
  sales_channel?: string | null;
}): ProtectedOrderReason {
  return (order.status ?? "").trim().toLowerCase() === "cancelled" ? "cancelled" : "test";
}

export function reportPaymentOnProtectedOrder(input: {
  orderId: string;
  paymentIntentId: string;
  status: string;
  reason: ProtectedOrderReason;
}) {
  console.error("[airwallex-orders] payment_on_protected_order", {
    tag: "jqd_alert",
    event: PAYMENT_ON_PROTECTED_ORDER_EVENT,
    orderId: input.orderId,
  });
}

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

function orderReleasedByExpiry(order: OrderRow) {
  // Any unreserved order that is not already paid. Abandoned is the sweep's
  // status, but failed (and other unpaid statuses) can also hold no stock.
  return order.inventory_reserved !== true && order.payment_status !== "succeeded";
}

function errorText(error: unknown) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

function isUnavailableStock(error: unknown) {
  // supabase.rpc returns PostgREST's JSON body as a plain { message, code }
  // object unless throwOnError is set. That object is not an Error.
  return /stock unavailable/i.test(errorText(error));
}

async function readStockCount(
  supabase: SupabaseClient,
  table: "products" | "product_variants",
  id: string
) {
  const { data, error } = await supabase
    .from(table)
    .select("stock_count")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  const count = Math.floor(Number(data?.stock_count ?? 0));
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

async function measureStockShortfall(
  supabase: SupabaseClient,
  lines: Array<{ product_id: string; variant_id: string | null; quantity: number }>
): Promise<PaymentAfterExpiryShortfall[]> {
  const shortfall: PaymentAfterExpiryShortfall[] = [];
  for (const line of lines) {
    const available = line.variant_id
      ? await readStockCount(supabase, "product_variants", line.variant_id)
      : await readStockCount(supabase, "products", line.product_id);
    if (available < line.quantity) {
      shortfall.push({
        productId: line.product_id,
        variantId: line.variant_id,
        requested: line.quantity,
        available,
      });
    }
  }
  return shortfall;
}

async function flagPaymentAfterExpiry(
  supabase: SupabaseClient,
  input: {
    order: OrderRow;
    payment: PaymentRow;
    paymentIntentId: string;
    providerEventId?: string | null;
    providerEventCreatedAt?: string | null;
    currentStatus: InternalPaymentStatus;
    now: string;
    shortfall: PaymentAfterExpiryShortfall[];
  }
) {
  let flagUpdate = supabase
    .from("orders")
    .update({
      payment_provider: AIRWALLEX_PROVIDER,
      payment_status: "succeeded",
      status: "inventory_exception",
      fulfillment_status: "payment_failed",
      paid_at: input.order.paid_at ?? input.now,
      updated_at: input.now,
    })
    .eq("id", input.order.id);
  flagUpdate =
    input.order.payment_status == null
      ? flagUpdate.is("payment_status", null)
      : flagUpdate.eq("payment_status", input.order.payment_status);
  const { data: flagged, error: flagError } = await flagUpdate.select("id").maybeSingle();
  if (flagError) throw flagError;
  if (!flagged) {
    throw new Error("Inventory exception was not recorded");
  }

  if (flagged) {
    reportPaymentAfterExpiryUnfulfilled({
      orderId: input.order.id,
      paymentIntentId: input.paymentIntentId,
      shortfall: input.shortfall,
    });
  }

  if (!isSuccessfulPaymentStatus(input.currentStatus)) {
    const { error: paymentUpdateError } = await supabase
      .from("payments")
      .update({
        status: "succeeded",
        last_event_id: input.providerEventId ?? null,
        last_event_created_at: input.providerEventCreatedAt ?? input.now,
        paid_at: input.now,
        updated_at: input.now,
      })
      .eq("id", input.payment.id)
      .neq("status", "succeeded");
    if (paymentUpdateError) throw paymentUpdateError;
  }

  return {
    applied: false as const,
    reason: "payment_after_expiry_unfulfilled" as const,
    orderId: input.order.id,
  };
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

/**
 * Restores stock for an order that still holds a reservation. Stored order
 * items are used first. `fallbackItems` covers the gap where this request
 * reserved stock but the line insert had not committed. The restore RPC
 * changes nothing when `inventory_reserved` is already false.
 */
export async function releaseOrderReservation(
  supabase: SupabaseClient,
  orderId: string,
  fallbackItems?: ReadonlyArray<{
    product_id: string;
    variant_id: string | null;
    quantity: number;
  }>
) {
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("inventory_reserved, payment_status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order || order.payment_status === "succeeded" || order.inventory_reserved !== true) {
    return { released: false as const };
  }

  let reservations = await getOrderItemReservations(supabase, orderId);
  if (!reservations.length && fallbackItems?.length) {
    reservations = fallbackItems.map((line) => ({
      product_id: line.product_id,
      variant_id: line.variant_id,
      quantity: line.quantity,
    }));
  }
  if (!reservations.length) {
    throw new Error("Order holds a reservation but has no items to restore");
  }

  const { data, error } = await supabase.rpc("restore_order_inventory", {
    p_order_id: orderId,
    order_items: reservations as unknown as Json,
  });
  if (error) throw error;

  const result = (data ?? []) as Array<{ success: boolean; was_reserved?: boolean; message: string }>;
  const failed = result.find((entry) => !entry.success);
  if (failed) throw new Error(failed.message || "Failed to restore inventory");
  return { released: Boolean(result[0]?.was_reserved) as boolean };
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
    metadata: input.intent as unknown as Json,
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
    amount?: number | string | null;
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

  const { data: protectedRow, error: protectedError } = await supabase
    .from("orders")
    .select("id, status, sales_channel")
    .eq("id", payment.order_id)
    .maybeSingle();
  if (protectedError) throw protectedError;
  if (protectedRow && isProtectedOrder(protectedRow)) {
    if (isSuccessfulPaymentStatus(input.nextStatus)) {
      const amountSource = input.amount == null ? payment.amount : input.amount;
      const parsedAmount = Number(amountSource);
      if (!Number.isFinite(parsedAmount)) {
        throw new Error("Payment amount is not a finite number");
      }
      const amount = parsedAmount;
      const { data: recorded, error: recordError } = await supabase
        .from("payments")
        .update({
          status: "succeeded",
          amount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id)
        .neq("status", "succeeded")
        .select("id")
        .maybeSingle();
      if (recordError) throw recordError;
      if (recorded) {
        console.error(
          JSON.stringify({
            tag: "jqd_alert",
            event: PROTECTED_ORDER_ALERT_EVENT,
            orderId: protectedRow.id,
          })
        );
      }
    }
    if (isSuccessfulPaymentStatus(input.nextStatus) || isTerminalFailedPaymentStatus(input.nextStatus)) {
      reportPaymentOnProtectedOrder({
        orderId: protectedRow.id,
        paymentIntentId: input.paymentIntentId,
        status: input.nextStatus,
        reason: protectedOrderReason(protectedRow),
      });
    }
    return { applied: false, reason: "protected_order" as const, orderId: protectedRow.id };
  }

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
      "id, status, sales_channel, fulfillment_status, payment_status, inventory_reserved, paid_at, updated_at, total_amount, refunded_amount"
    )
    .eq("id", payment.order_id)
    .single();
  if (orderError) throw orderError;

  const order = orderData as unknown as OrderRow;
  let reReservedThisCall = false;
  if (claimingPaid && orderReleasedByExpiry(order)) {
    const lines = await getOrderItemReservations(supabase, order.id);
    let stockShort = lines.length === 0;
    if (!stockShort) {
      try {
        await reserveOrderInventory(supabase, order.id, lines);
      } catch (error) {
        if (!isUnavailableStock(error)) throw error;
        stockShort = true;
      }
    }
    if (stockShort) {
      const shortfall = lines.length ? await measureStockShortfall(supabase, lines) : [];
      return flagPaymentAfterExpiry(supabase, {
        order,
        payment,
        paymentIntentId: input.paymentIntentId,
        providerEventId: input.providerEventId,
        providerEventCreatedAt: input.providerEventCreatedAt,
        currentStatus,
        now,
        shortfall,
      });
    }
    reReservedThisCall = true;
  }

  const statusUpdate = deriveOrderStatusForPayment(order, input.nextStatus);
  const orderPatch: {
    payment_provider: typeof AIRWALLEX_PROVIDER;
    payment_status: string | null;
    status: string | null;
    fulfillment_status: string | null;
    paid_at: string | null;
    updated_at: string;
    inventory_reserved?: boolean;
  } = {
    payment_provider: AIRWALLEX_PROVIDER,
    payment_status: statusUpdate.payment_status,
    status: statusUpdate.status,
    fulfillment_status: statusUpdate.fulfillment_status,
    paid_at: statusUpdate.paid_at,
    updated_at: now,
  };
  // restore_order_inventory only looks at inventory_reserved. It cannot also
  // require the order to still be unpaid without a new SQL function. When the
  // reaper has claimed this row (abandoned, flag still true) and a payment
  // then succeeds, clear the flag here and do not return stock. The reaper's
  // later restore becomes a no-op. A re-reserve in this same call keeps the flag.
  if (
    claimingPaid &&
    !reReservedThisCall &&
    order.inventory_reserved === true &&
    order.payment_status === "abandoned"
  ) {
    orderPatch.inventory_reserved = false;
  }

  if (claimingPaid) {
    // Compare-and-set on the reservation flag and the payment_status we read.
    // A restore that wins between this read and the write clears the flag, so
    // the paid update matches 0 rows instead of marking a paid order with no stock.
    const expectReserved = reReservedThisCall || order.inventory_reserved === true;
    const alreadyRecordedPaid = order.payment_status === "succeeded";
    let claimedOrder: { id: string } | null = null;
    if (!alreadyRecordedPaid) {
      let paidUpdate = supabase.from("orders").update(orderPatch).eq("id", order.id);
      if (expectReserved) {
        paidUpdate = paidUpdate.eq("inventory_reserved", true);
        paidUpdate =
          order.payment_status == null
            ? paidUpdate.is("payment_status", null)
            : paidUpdate.eq("payment_status", order.payment_status);
      } else {
        paidUpdate = paidUpdate.or("payment_status.is.null,payment_status.neq.succeeded");
      }
      const paidResult = await paidUpdate.select("id").maybeSingle();
      if (paidResult.error) throw paidResult.error;
      claimedOrder = paidResult.data;
    }

    if (!claimedOrder && expectReserved) {
      const { data: freshOrder, error: freshError } = await supabase
        .from("orders")
        .select("id, status, fulfillment_status, payment_status, inventory_reserved, paid_at")
        .eq("id", order.id)
        .maybeSingle();
      if (freshError) throw freshError;
      const fresh = freshOrder as {
        id: string;
        status: string | null;
        fulfillment_status: string | null;
        payment_status: string | null;
        inventory_reserved: boolean | null;
        paid_at: string | null;
      } | null;
      const alreadyPaid = fresh?.payment_status === "succeeded" || fresh?.status === "paid";
      if (fresh && !alreadyPaid && fresh.inventory_reserved !== true) {
        const lines = await getOrderItemReservations(supabase, order.id);
        let stockShort = lines.length === 0;
        if (!stockShort) {
          try {
            await reserveOrderInventory(supabase, order.id, lines);
          } catch (error) {
            if (!isUnavailableStock(error)) throw error;
            stockShort = true;
          }
        }
        if (stockShort) {
          const shortfall = lines.length ? await measureStockShortfall(supabase, lines) : [];
          return flagPaymentAfterExpiry(supabase, {
            order: { ...order, ...fresh },
            payment,
            paymentIntentId: input.paymentIntentId,
            providerEventId: input.providerEventId,
            providerEventCreatedAt: input.providerEventCreatedAt,
            currentStatus,
            now,
            shortfall,
          });
        }
        const retryPatch = { ...orderPatch };
        delete retryPatch.inventory_reserved;
        let retryUpdate = supabase
          .from("orders")
          .update(retryPatch)
          .eq("id", order.id)
          .eq("inventory_reserved", true);
        retryUpdate =
          fresh.payment_status == null
            ? retryUpdate.is("payment_status", null)
            : retryUpdate.eq("payment_status", fresh.payment_status);
        const retry = await retryUpdate.select("id").maybeSingle();
        if (retry.error) throw retry.error;
        claimedOrder = retry.data;
      }
    }

    if (!claimedOrder) {
      const { data: currentOrder, error: rereadError } = await supabase
        .from("orders")
        .select("payment_status, status")
        .eq("id", order.id)
        .maybeSingle();
      if (rereadError) throw rereadError;
      if (currentOrder?.payment_status !== "succeeded") {
        // The reaper (or another writer) changed the row after we read it.
        // Do not mark the webhook processed. Airwallex redelivers, and that
        // delivery takes the re-reserve or inventory_exception path.
        reportPaidClaimLost(order.id);
        throw new Error("Paid claim did not match the order row");
      }
      if (currentOrder.status === "inventory_exception") {
        if (!isSuccessfulPaymentStatus(currentStatus)) {
          const { error: paymentUpdateError } = await supabase
            .from("payments")
            .update({
              status: "succeeded",
              last_event_id: input.providerEventId ?? null,
              last_event_created_at: input.providerEventCreatedAt ?? now,
              paid_at: now,
              updated_at: now,
            })
            .eq("id", payment.id)
            .neq("status", "succeeded");
          if (paymentUpdateError) throw paymentUpdateError;
        }
        return {
          applied: false,
          reason: "payment_after_expiry_unfulfilled" as const,
          orderId: order.id,
        };
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

export async function applyAirwallexRefundEvent(
  supabase: SupabaseClient,
  input: {
    eventName: string;
    refundObject: Record<string, unknown>;
    providerEventId?: string | null;
    providerEventCreatedAt?: string | null;
  }
) {
  // Refunds are intentionally allowed on cancelled or test orders,
  // because a refund after a cancel is the normal path.
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
      .select("id, status, sales_channel, total_amount, refunded_amount")
      .eq("id", paymentData.order_id)
      .single();
    if (orderError) throw orderError;

    const totalAmount = toNumber(orderData.total_amount);
    const currentRefundedAmount = toNumber(orderData.refunded_amount);
    const nextRefundedAmount = Math.min(totalAmount, currentRefundedAmount + refundAmount);
    const fullyRefunded = totalAmount > 0 && nextRefundedAmount >= totalAmount;
    const orderPatch: {
      refunded_amount: number;
      updated_at: string;
      status?: string;
      fulfillment_status?: string;
    } = {
      refunded_amount: nextRefundedAmount,
      updated_at: now,
    };
    if (!isProtectedOrder(orderData)) {
      orderPatch.status = fullyRefunded ? "refunded" : "paid";
      orderPatch.fulfillment_status = fullyRefunded ? "refunded" : "paid";
    }

    const { error: updateOrderError } = await supabase
      .from("orders")
      .update(orderPatch)
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
  const columns = "id, status, payment_status, inventory_reserved";

  const pending = await supabase
    .from("orders")
    .select(columns)
    .eq("payment_provider", AIRWALLEX_PROVIDER)
    .eq("inventory_reserved", true)
    .in("payment_status", pendingStatuses)
    .lt("created_at", cutoff)
    .order("created_at")
    .limit(25);
  if (pending.error) throw pending.error;

  const failed = await supabase
    .from("orders")
    .select(columns)
    .eq("payment_provider", AIRWALLEX_PROVIDER)
    .eq("inventory_reserved", true)
    .eq("status", "failed")
    .or("payment_status.is.null,payment_status.neq.succeeded")
    .order("created_at")
    .limit(25);
  if (failed.error) throw failed.error;

  const staleOrders = new Map<
    string,
    { id: string; status: string | null; inventory_reserved: boolean | null }
  >();
  for (const row of [...(pending.data ?? []), ...(failed.data ?? [])] as Array<{
    id: string;
    status: string | null;
    inventory_reserved: boolean | null;
  }>) {
    staleOrders.set(row.id, row);
  }

  for (const order of staleOrders.values()) {
    try {
      if (!order.inventory_reserved) continue;
      // Claim the row before restore. restore_order_inventory returns no stock once
      // inventory_reserved is false, so this update leaves that flag set and the
      // restore below clears it. A second sweep, or a payment that landed first,
      // matches no row and does not restore.
      let claim = supabase
        .from("orders")
        .update({
          payment_status: "abandoned",
          status: "failed",
          fulfillment_status: "payment_failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .eq("inventory_reserved", true)
        .or("payment_status.is.null,payment_status.neq.succeeded")
        .neq("status", "succeeded");
      claim =
        order.status === "failed"
          ? claim.eq("status", "failed")
          : claim.in("payment_status", pendingStatuses);
      const { data: released, error: updateError } = await claim.select("id").maybeSingle();
      if (updateError) throw updateError;
      if (!released) continue;
      const { data: stillUnpaid, error: stillUnpaidError } = await supabase
        .from("orders")
        .select("id")
        .eq("id", order.id)
        .eq("inventory_reserved", true)
        .eq("payment_status", "abandoned")
        .neq("status", "paid")
        .maybeSingle();
      if (stillUnpaidError) throw stillUnpaidError;
      if (!stillUnpaid) continue;
      const { data: succeededPayment, error: succeededPaymentError } = await supabase
        .from("payments")
        .select("id")
        .eq("order_id", order.id)
        .eq("provider", AIRWALLEX_PROVIDER)
        .eq("status", "succeeded")
        .limit(1);
      if (succeededPaymentError) throw succeededPaymentError;
      if ((succeededPayment ?? []).length > 0) continue;
      await restoreInventoryForOrder(supabase, order.id);
    } catch {
      console.error("[reservation-release]", order.id);
    }
  }
}
