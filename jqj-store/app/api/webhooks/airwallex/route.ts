import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeAirwallexPaymentStatus,
  verifyAirwallexWebhookSignature,
} from "@/lib/payments/airwallex";
import {
  applyAirwallexPaymentIntentStatus,
  applyAirwallexRefundEvent,
  findAirwallexPaymentByIntent,
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

function isClientSecretKey(key: string) {
  return key.replace(/[_-]/g, "").toLowerCase() === "clientsecret";
}

function withoutClientSecret(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => withoutClientSecret(entry));
  if (!value || typeof value !== "object") return value;

  const copy: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (isClientSecretKey(key)) continue;
    copy[key] = withoutClientSecret(nested);
  }
  return copy;
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
    maxSkewSeconds: Number(process.env.AIRWALLEX_WEBHOOK_MAX_SKEW_SECONDS || 300),
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
      payload: withoutClientSecret(event) as Record<string, unknown>,
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

      const paymentRow = await findAirwallexPaymentByIntent(supabase, paymentIntentId);

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

      if ("reason" in applyResult && applyResult.reason === "order_not_claimed") {
        const failedOrderId = applyResult.orderId ?? linkedOrderId;
        console.error("[airwallex-webhook] order_not_claimed", {
          orderId: failedOrderId,
          merchantOrderId,
          paymentIntentId,
        });
        if (webhookRowId) {
          const { error: markFailedError } = await supabase
            .from("payment_webhook_events")
            .update({
              status: "failed",
              processing_error: "order_not_claimed",
              processed_at: new Date().toISOString(),
              order_id: failedOrderId,
              payment_id: linkedPaymentId,
            })
            .eq("id", webhookRowId);
          if (markFailedError) throw markFailedError;
        }
        return NextResponse.json({ received: true, failed: true });
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

    const paymentIntentId =
      typeof event.data?.object?.id === "string" ? event.data.object.id : null;
    console.error("[airwallex-webhook] internal error", {
      orderId: linkedOrderId,
      paymentId: linkedPaymentId,
      paymentIntentId,
      webhookEventId: event.id,
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

