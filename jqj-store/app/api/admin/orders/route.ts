import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  canTransitionOrderStatus,
  isFullyRefunded,
  isOrderStatus,
  normalizeOrderStatus,
} from "@/lib/order-lifecycle";
import {
  createAirwallexRefund,
  normalizeAirwallexPaymentStatus,
  normalizeAirwallexRefundStatus,
  retrieveAirwallexPaymentIntent,
} from "@/lib/payments/airwallex";
import {
  applyAirwallexPaymentIntentStatus,
  applyAirwallexRefundEvent,
  isProtectedOrder,
  upsertAirwallexPaymentIntent,
} from "@/lib/payments/airwallex-orders";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

async function loadOrderWithRelations(supabase: ReturnType<typeof createAdminClient>, id: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*), order_refunds(*), payments(*, payment_refunds(*))")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function GET(req: Request) {
  try {
    const authError = await requireAdmin(req);
    if (authError) return authError;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*), order_refunds(*), payments(*, payment_refunds(*))")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ orders: data }, { headers: noStore });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load orders" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const authError = await requireAdmin(req);
    if (authError) return authError;

    const { id, status } = await req.json();
    if (!id || !status || typeof status !== "string") {
      return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
    }

    const nextStatus = status.trim().toLowerCase();
    if (!isOrderStatus(nextStatus)) {
      return NextResponse.json({ error: "Invalid order status" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existing, error: existingError } = await supabase
      .from("orders")
      .select("id, status, total_amount, refunded_amount")
      .eq("id", id)
      .single();

    if (existingError) throw existingError;

    const totalAmount = Number(existing.total_amount ?? 0);
    const refundedAmount = Number(existing.refunded_amount ?? 0);
    const normalizedCurrentStatus = normalizeOrderStatus(existing.status ?? "");

    if (!normalizedCurrentStatus) {
      return NextResponse.json({ error: "Order has unsupported status value" }, { status: 400 });
    }

    if (nextStatus === "refunded" && !isFullyRefunded(totalAmount, refundedAmount)) {
      return NextResponse.json(
        { error: "Order can be marked refunded only when total refunded amount is complete" },
        { status: 400 }
      );
    }

    if (!canTransitionOrderStatus(normalizedCurrentStatus, nextStatus)) {
      return NextResponse.json(
        { error: `Invalid status transition from ${normalizedCurrentStatus} to ${nextStatus}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("orders")
      .update({
        status: nextStatus,
        fulfillment_status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ order: data }, { headers: noStore });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update order" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const authError = await requireAdmin(req);
    if (authError) return authError;

    const body = (await req.json()) as {
      action?: string;
      id?: string;
      amount?: number | string;
      reason?: string;
      confirm?: boolean;
    };
    const action = body.action ?? "refund";
    const id = body.id;
    const amount = body.amount;
    const reason = body.reason;
    const parsedAmount = Number(amount);
    const supabase = createAdminClient();

    if (action === "refresh_payment") {
      if (!id) {
        return NextResponse.json({ error: "Missing order id" }, { status: 400 });
      }

      const { data: orderSnapshot, error: orderSnapshotError } = await supabase
        .from("orders")
        .select(
          "id, status, sales_channel, payments(id, provider, provider_payment_intent_id, provider_request_id)"
        )
        .eq("id", id)
        .single();
      if (orderSnapshotError) throw orderSnapshotError;

      const payments = (orderSnapshot.payments ?? []) as Array<{
        id: string;
        provider: string;
        provider_payment_intent_id: string;
        provider_request_id: string | null;
      }>;

      const airwallexPayment = payments.find((payment) => payment.provider === "airwallex");
      if (!airwallexPayment?.provider_payment_intent_id) {
        return NextResponse.json(
          { error: "This order has no Airwallex payment record to refresh" },
          { status: 404 }
        );
      }

      const intent = await retrieveAirwallexPaymentIntent(
        airwallexPayment.provider_payment_intent_id
      );

      if (!isProtectedOrder(orderSnapshot)) {
        await upsertAirwallexPaymentIntent(supabase, {
          orderId: id,
          requestId:
            intent.request_id ?? airwallexPayment.provider_request_id ?? `refresh-${id}-${Date.now()}`,
          intent,
        });
      }
      await applyAirwallexPaymentIntentStatus(supabase, {
        paymentIntentId: intent.id,
        nextStatus: normalizeAirwallexPaymentStatus(intent.status ?? ""),
        providerEventCreatedAt: intent.updated_at ?? null,
        force: true,
      });

      const updatedOrder = await loadOrderWithRelations(supabase, id);
      return NextResponse.json({ order: updatedOrder }, { headers: noStore });
    }

    if (action !== "refund") {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    if (body.confirm !== true) {
      return NextResponse.json(
        { error: "Explicit refund confirmation is required" },
        { status: 400 }
      );
    }

    if (!id || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: "Missing id or valid refund amount" }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("orders")
      .select(
        "id, status, total_amount, refunded_amount, payment_provider, payments(id, provider, provider_payment_intent_id, currency)"
      )
      .eq("id", id)
      .single();

    if (existingError) throw existingError;

    const totalAmount = Number(existing.total_amount ?? 0);
    const refundedAmount = Number(existing.refunded_amount ?? 0);
    const normalizedCurrentStatus = normalizeOrderStatus(existing.status ?? "");

    if (!normalizedCurrentStatus || normalizedCurrentStatus === "refunded") {
      return NextResponse.json({ error: "Order is already fully refunded" }, { status: 400 });
    }

    const payments = (existing.payments ?? []) as Array<{
      id: string;
      provider: string;
      provider_payment_intent_id: string;
      currency: string | null;
    }>;

    if (existing.payment_provider === "airwallex") {
      const payment = payments.find((entry) => entry.provider === "airwallex");
      if (!payment?.provider_payment_intent_id) {
        return NextResponse.json(
          { error: "Airwallex payment record is missing for this order" },
          { status: 400 }
        );
      }

      const { data: existingProviderRefunds, error: existingProviderRefundsError } = await supabase
        .from("payment_refunds")
        .select("amount, status")
        .eq("order_id", id)
        .eq("provider", "airwallex")
        .neq("status", "failed");
      if (existingProviderRefundsError) throw existingProviderRefundsError;

      const committedRefundAmount = (existingProviderRefunds ?? []).reduce(
        (sum, refund) => sum + Number(refund.amount ?? 0),
        0
      );
      const remaining = Math.max(totalAmount - committedRefundAmount, 0);

      if (parsedAmount > remaining) {
        return NextResponse.json(
          {
            error: `Refund amount exceeds remaining refundable balance (${remaining.toFixed(2)})`,
          },
          { status: 400 }
        );
      }

      const createdRefund = await createAirwallexRefund({
        paymentIntentId: payment.provider_payment_intent_id,
        requestId: randomUUID(),
        amount: parsedAmount,
        currency: (payment.currency ?? "USD").toUpperCase(),
        reason: typeof reason === "string" ? reason : undefined,
        metadata: {
          order_id: id,
          initiated_by: process.env.ADMIN_EMAIL ?? "admin",
        },
      });

      const normalizedRefundStatus = normalizeAirwallexRefundStatus(createdRefund.status);
      const eventName =
        normalizedRefundStatus === "settled"
          ? "refund.settled"
          : normalizedRefundStatus === "accepted"
            ? "refund.accepted"
            : normalizedRefundStatus === "failed"
              ? "refund.failed"
              : "refund.received";

      await applyAirwallexRefundEvent(supabase, {
        eventName,
        refundObject: {
          ...createdRefund,
          amount: createdRefund.amount ?? parsedAmount,
          currency: createdRefund.currency ?? payment.currency ?? "USD",
          reason: createdRefund.reason ?? reason ?? null,
          payment_intent_id: createdRefund.payment_intent_id ?? payment.provider_payment_intent_id,
        },
      });

      if (createdRefund.id) {
        const { error: refundInitiatorError } = await supabase
          .from("payment_refunds")
          .update({ initiated_by: process.env.ADMIN_EMAIL ?? "admin" })
          .eq("provider", "airwallex")
          .eq("provider_refund_id", createdRefund.id);
        if (refundInitiatorError) throw refundInitiatorError;
      }

      const updatedOrder = await loadOrderWithRelations(supabase, id);
      return NextResponse.json(
        {
          order: updatedOrder,
          refundStatus: normalizedRefundStatus,
        },
        { headers: noStore }
      );
    }

    const remaining = Math.max(totalAmount - refundedAmount, 0);
    if (parsedAmount > remaining) {
      return NextResponse.json(
        { error: `Refund amount exceeds remaining refundable balance (${remaining.toFixed(2)})` },
        { status: 400 }
      );
    }

    const { error: refundError } = await supabase.rpc("apply_order_refund", {
      p_order_id: id,
      p_amount: parsedAmount,
      p_reason: typeof reason === "string" ? reason : null,
    });

    if (refundError) {
      return NextResponse.json({ error: refundError.message }, { status: 400 });
    }

    const updatedOrder = await loadOrderWithRelations(supabase, id);

    return NextResponse.json({ order: updatedOrder }, { headers: noStore });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to process refund" },
      { status: 500 }
    );
  }
}
