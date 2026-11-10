import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isPendingPaymentStatus,
  isSuccessfulPaymentStatus,
  isTerminalFailedPaymentStatus,
  normalizeAirwallexPaymentStatus,
  retrieveAirwallexPaymentIntent,
} from "@/lib/payments/airwallex";
import {
  applyAirwallexPaymentIntentStatus,
  retryUnsentPaidConfirmation,
  upsertAirwallexPaymentIntent,
} from "@/lib/payments/airwallex-orders";

export const dynamic = "force-dynamic";

interface OrderPaymentSnapshot {
  id: string;
  status: string | null;
  payment_status: string | null;
  fulfillment_status: string | null;
  inventory_reserved: boolean | null;
  payments: Array<{
    id: string;
    provider: string;
    provider_payment_intent_id: string;
    status: string;
    provider_request_id: string | null;
  }> | null;
}

function getTerminalResponseStatus(paymentStatus: string) {
  if (paymentStatus === "succeeded") return 200;
  if (paymentStatus === "failed" || paymentStatus === "cancelled" || paymentStatus === "abandoned") {
    return 402;
  }
  return 202;
}

export async function POST(req: Request) {
  try {
    const { orderId, refresh = true } = (await req.json()) as {
      orderId?: string;
      refresh?: boolean;
    };

    if (!orderId) {
      return NextResponse.json({ error: "Missing order id" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select(
        "id, status, payment_status, fulfillment_status, inventory_reserved, payments(id, provider, provider_payment_intent_id, status, provider_request_id)"
      )
      .eq("id", orderId)
      .single();
    if (orderError) throw orderError;

    const order = orderData as unknown as OrderPaymentSnapshot;
    const payment = (order.payments ?? []).find((entry) => entry.provider === "airwallex");
    if (!payment) {
      return NextResponse.json(
        { error: "No Airwallex payment found for this order" },
        { status: 404 }
      );
    }

    let effectiveStatus = normalizeAirwallexPaymentStatus(payment.status);
    let appliedThisRequest = false;

    if (
      refresh &&
      !isSuccessfulPaymentStatus(effectiveStatus) &&
      !isTerminalFailedPaymentStatus(effectiveStatus)
    ) {
      const intent = await retrieveAirwallexPaymentIntent(payment.provider_payment_intent_id);

      await upsertAirwallexPaymentIntent(supabase, {
        orderId: order.id,
        requestId: intent.request_id ?? payment.provider_request_id ?? `verify-${order.id}`,
        intent,
      });
      await applyAirwallexPaymentIntentStatus(supabase, {
        paymentIntentId: intent.id,
        nextStatus: normalizeAirwallexPaymentStatus(intent.status),
        providerEventCreatedAt: intent.updated_at ?? null,
        force: true,
      });
      appliedThisRequest = true;

      effectiveStatus = normalizeAirwallexPaymentStatus(intent.status);
    }

    const { data: refreshedOrderData, error: refreshedOrderError } = await supabase
      .from("orders")
      .select("id, status, payment_status, fulfillment_status, inventory_reserved, paid_at")
      .eq("id", order.id)
      .single();
    if (refreshedOrderError) throw refreshedOrderError;

    const refreshedOrder = refreshedOrderData as {
      id: string;
      status: string | null;
      payment_status: string | null;
      fulfillment_status: string | null;
      inventory_reserved: boolean | null;
      paid_at: string | null;
    };

    const normalizedOrderPaymentStatus = normalizeAirwallexPaymentStatus(
      refreshedOrder.payment_status ?? effectiveStatus
    );

    if (!appliedThisRequest && isSuccessfulPaymentStatus(normalizedOrderPaymentStatus)) {
      await retryUnsentPaidConfirmation(supabase, refreshedOrder.id);
    }

    return NextResponse.json(
      {
        orderId: refreshedOrder.id,
        orderStatus: refreshedOrder.status,
        paymentStatus: normalizedOrderPaymentStatus,
        fulfillmentStatus: refreshedOrder.fulfillment_status,
        inventoryReserved: Boolean(refreshedOrder.inventory_reserved),
        paidAt: refreshedOrder.paid_at,
        pending: isPendingPaymentStatus(normalizedOrderPaymentStatus),
        succeeded: isSuccessfulPaymentStatus(normalizedOrderPaymentStatus),
        failed: isTerminalFailedPaymentStatus(normalizedOrderPaymentStatus),
      },
      {
        status: getTerminalResponseStatus(normalizedOrderPaymentStatus),
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("[airwallex-verify]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to verify payment status" },
      { status: 500 }
    );
  }
}

