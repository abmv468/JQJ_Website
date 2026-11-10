import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeAirwallexPaymentStatus,
  resolveAirwallexWebhookMaxSkewSeconds,
  verifyAirwallexWebhookSignature,
} from "@/lib/payments/airwallex";
import {
  applyAirwallexPaymentIntentStatus,
  applyAirwallexRefundEvent,
  upsertAirwallexPaymentIntent,
} from "@/lib/payments/airwallex-orders";

export const dynamic = "force-dynamic";

interface AirwallexWebhookEvent {
  id: string;
  name: string;
  created_at?: string;
  data?: {
    object?: Record<string, unknown>;
  };
}

function truncateError(input: string, maxLength = 1000) {
  if (input.length <= maxLength) return input;
  return `${input.slice(0, maxLength - 3)}...`;
}

export async function POST(req: Request) {
  const webhookSecret = process.env.AIRWALLEX_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "AIRWALLEX_WEBHOOK_SECRET is not configured" },
      { status: 500 }
    );
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-signature");
  const timestamp = req.headers.get("x-timestamp");

  const signatureResult = verifyAirwallexWebhookSignature({
    rawBody,
    signature,
    timestamp,
    secret: webhookSecret,
    maxSkewSeconds: resolveAirwallexWebhookMaxSkewSeconds(
      process.env.AIRWALLEX_WEBHOOK_MAX_SKEW_SECONDS
    ),
  });

  if (!signatureResult.ok) {
    return NextResponse.json(
      { error: signatureResult.error || "Invalid webhook signature" },
      { status: 400 }
    );
  }

  let event: AirwallexWebhookEvent;
  try {
    event = JSON.parse(rawBody) as AirwallexWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!event?.id || !event?.name) {
    return NextResponse.json({ error: "Missing webhook event id or name" }, { status: 400 });
  }

  const supabase = createAdminClient();
  let webhookRowId: string | null = null;

  const { data: insertedEvent, error: insertEventError } = await supabase
    .from("payment_webhook_events")
    .insert({
      provider: "airwallex",
      provider_event_id: event.id,
      event_name: event.name,
      payload: event as unknown as Record<string, unknown>,
      event_created_at: event.created_at ?? null,
      status: "received",
    })
    .select("id")
    .maybeSingle();

  if (insertEventError) {
    if ((insertEventError as { code?: string }).code !== "23505") {
      return NextResponse.json({ error: insertEventError.message }, { status: 500 });
    }

    const { data: existingEvent, error: existingEventError } = await supabase
      .from("payment_webhook_events")
      .select("id, status")
      .eq("provider", "airwallex")
      .eq("provider_event_id", event.id)
      .maybeSingle();
    if (existingEventError) {
      return NextResponse.json({ error: existingEventError.message }, { status: 500 });
    }

    if (existingEvent?.status === "processed" || existingEvent?.status === "ignored") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    webhookRowId = existingEvent?.id ?? null;
  } else {
    webhookRowId = insertedEvent?.id ?? null;
  }

  let linkedOrderId: string | null = null;
  let linkedPaymentId: string | null = null;

  try {
    if (event.name.startsWith("payment_intent.")) {
      const object = event.data?.object ?? {};
      const paymentIntentId = typeof object.id === "string" ? object.id : null;
      const merchantOrderId =
        typeof object.merchant_order_id === "string" ? object.merchant_order_id : null;

      if (!paymentIntentId) {
        throw new Error("payment_intent event is missing data.object.id");
      }

      const { data: paymentRow, error: paymentRowError } = await supabase
        .from("payments")
        .select("id, order_id")
        .eq("provider", "airwallex")
        .eq("provider_payment_intent_id", paymentIntentId)
        .maybeSingle();
      if (paymentRowError) throw paymentRowError;

      linkedOrderId = paymentRow?.order_id ?? merchantOrderId ?? null;
      linkedPaymentId = paymentRow?.id ?? null;

      if (!paymentRow && merchantOrderId) {
        const { data: orderRow, error: orderRowError } = await supabase
          .from("orders")
          .select("id")
          .eq("id", merchantOrderId)
          .maybeSingle();
        if (orderRowError) throw orderRowError;

        if (orderRow) {
          const upsertedPayment = await upsertAirwallexPaymentIntent(supabase, {
            orderId: orderRow.id,
            requestId:
              (typeof object.request_id === "string" && object.request_id) || `wh-${event.id}`,
            intent: {
              id: paymentIntentId,
              request_id:
                typeof object.request_id === "string" ? object.request_id : undefined,
              status: typeof object.status === "string" ? object.status : "PENDING",
              amount: Number(object.amount ?? 0),
              currency: String(object.currency ?? "USD"),
              merchant_order_id: merchantOrderId,
              updated_at: event.created_at,
              ...object,
            },
          });
          linkedPaymentId = upsertedPayment.id;
          linkedOrderId = upsertedPayment.order_id;
        }
      }

      const applyResult = await applyAirwallexPaymentIntentStatus(supabase, {
        paymentIntentId,
        nextStatus: normalizeAirwallexPaymentStatus(
          typeof object.status === "string" ? object.status : null
        ),
        providerEventId: event.id,
        providerEventCreatedAt: event.created_at ?? null,
      });

      if (!linkedOrderId && "orderId" in applyResult) {
        linkedOrderId = applyResult.orderId ?? null;
      }
    } else if (event.name.startsWith("refund.")) {
      const object = event.data?.object ?? {};
      const refundResult = await applyAirwallexRefundEvent(supabase, {
        eventName: event.name,
        refundObject: object,
        providerEventId: event.id,
        providerEventCreatedAt: event.created_at ?? null,
      });

      if ("orderId" in refundResult) {
        linkedOrderId = refundResult.orderId ?? null;
      }
    } else {
      if (webhookRowId) {
        const { error: markIgnoredError } = await supabase
          .from("payment_webhook_events")
          .update({
            status: "ignored",
            processed_at: new Date().toISOString(),
            order_id: linkedOrderId,
            payment_id: linkedPaymentId,
          })
          .eq("id", webhookRowId);
        if (markIgnoredError) throw markIgnoredError;
      }
      return NextResponse.json({ received: true, ignored: true });
    }

    if (webhookRowId) {
      const { error: markProcessedError } = await supabase
        .from("payment_webhook_events")
        .update({
          status: "processed",
          processed_at: new Date().toISOString(),
          order_id: linkedOrderId,
          payment_id: linkedPaymentId,
          processing_error: null,
        })
        .eq("id", webhookRowId);
      if (markProcessedError) throw markProcessedError;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    if (webhookRowId) {
      const errorMessage = truncateError(
        error instanceof Error ? error.message : "Webhook processing failed"
      );
      await supabase
        .from("payment_webhook_events")
        .update({
          status: "failed",
          processing_error: errorMessage,
        })
        .eq("id", webhookRowId);
    }

    console.error("[airwallex-webhook]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed" },
      { status: 500 }
    );
  }
}

