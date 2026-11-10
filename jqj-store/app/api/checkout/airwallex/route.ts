import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isValidSingleEmail,
  normalizeSingleEmail,
  SINGLE_EMAIL_FIELD_MESSAGE,
} from "@/lib/email-address";
import { normalizeCurrency, type SupportedCurrency } from "@/lib/currency";
import { computeShippingUsd } from "@/lib/shipping";
import {
  fetchInventoryBySlugs,
  reserveStockForOrder,
  restoreStockForOrder,
  validateCheckoutItems,
  type CheckoutItemInput,
  type ResolvedCheckoutItem,
} from "@/lib/inventory";
import {
  createAirwallexPaymentIntent,
  getAirwallexSdkEnvironment,
  normalizeAirwallexPaymentStatus,
} from "@/lib/payments/airwallex";
import {
  applyAirwallexPaymentIntentStatus,
  releaseExpiredAirwallexReservations,
  upsertAirwallexPaymentIntent,
} from "@/lib/payments/airwallex-orders";

export const dynamic = "force-dynamic";

const PHASE_ONE_CURRENCY: SupportedCurrency = "USD";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const COUNTRY_CODE_MAP: Record<string, string> = {
  "UNITED STATES": "US",
  "UNITED KINGDOM": "GB",
  CANADA: "CA",
  AUSTRALIA: "AU",
  "HONG KONG SAR": "HK",
  "HONG KONG": "HK",
  SINGAPORE: "SG",
  NETHERLANDS: "NL",
  GERMANY: "DE",
};

function toCountryCode(country: string | undefined) {
  if (!country) return undefined;
  return COUNTRY_CODE_MAP[country.trim().toUpperCase()];
}

function asUuid(value: string | undefined | null) {
  if (!value) return null;
  return UUID_REGEX.test(value) ? value : null;
}

async function getAuthenticatedUserId() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // No-op in route handlers when cookies cannot be set.
          }
        },
      },
    }
  );
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function POST(req: Request) {
  let supabase: ReturnType<typeof createAdminClient> | null = null;
  let orderId: string | null = null;
  let reservedStock = false;
  let resolvedItems: ResolvedCheckoutItem[] = [];

  try {
    const { items, customer, idempotencyKey, currency } = (await req.json()) as {
      items: CheckoutItemInput[];
      customer: Record<string, string>;
      idempotencyKey?: string;
      currency?: string;
    };

    if (!items?.length) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }
    const customerEmail = normalizeSingleEmail(typeof customer?.email === "string" ? customer.email : "");
    if (!isValidSingleEmail(customerEmail)) {
      return NextResponse.json(
        {
          error: "Check the highlighted fields.",
          fields: { email: SINGLE_EMAIL_FIELD_MESSAGE },
        },
        { status: 400 }
      );
    }
    if (!customer?.firstName || !customer?.address || !customer?.city) {
      return NextResponse.json(
        { error: "Missing required customer checkout details" },
        { status: 400 }
      );
    }

    const selectedCurrency = normalizeCurrency(currency);
    if (selectedCurrency !== PHASE_ONE_CURRENCY) {
      return NextResponse.json(
        {
          error:
            "Airwallex checkout is currently enabled for USD only in phase 1. Please switch currency to USD.",
        },
        { status: 400 }
      );
    }

    const userId = await getAuthenticatedUserId();
    const customerName = `${customer.firstName} ${customer.lastName ?? ""}`.trim();
    const requestId = asUuid(idempotencyKey) ?? randomUUID();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const returnUrl = `${siteUrl}/order-confirmation?provider=airwallex`;

    supabase = createAdminClient();
    await releaseExpiredAirwallexReservations(supabase);

    const slugs = Array.from(new Set(items.map((item) => item.slug).filter(Boolean) as string[]));
    const inventoryBySlug = await fetchInventoryBySlugs(supabase, slugs);
    const validation = validateCheckoutItems(items, inventoryBySlug);
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.errors[0] || "Insufficient stock" },
        { status: 409 }
      );
    }

    resolvedItems = validation.resolved;
    const subtotal = resolvedItems.reduce(
      (sum, line) => sum + line.product.price * line.requestedQuantity,
      0
    );
    const shippingAmount = computeShippingUsd(
      resolvedItems.map((line) => ({
        unitPriceUsd: line.product.price,
        quantity: line.requestedQuantity,
      }))
    );
    const total = subtotal + shippingAmount;

    const shippingAddress = {
      address: customer.address,
      apartment: customer.apartment || "",
      city: customer.city,
      region: customer.region || "",
      country: customer.country || "",
      phone: customer.phone || "",
      payment_method: "airwallex" as const,
      currency: selectedCurrency,
    };

    const { data: existingPaymentByRequest, error: existingPaymentError } = await supabase
      .from("payments")
      .select("order_id")
      .eq("provider", "airwallex")
      .eq("provider_request_id", requestId)
      .maybeSingle();
    if (existingPaymentError) throw existingPaymentError;

    orderId = existingPaymentByRequest?.order_id ?? null;
    if (!orderId) {
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: userId,
          status: "pending",
          payment_provider: "airwallex",
          payment_status: "requires_payment_method",
          fulfillment_status: "pending_payment",
          verification_completed: false,
          inventory_reserved: false,
          subtotal_amount: subtotal,
          total_amount: total,
          shipping_amount: shippingAmount,
          discount_amount: 0,
          tax_amount: 0,
          currency: selectedCurrency,
          shipping_address: shippingAddress,
          customer_email: customerEmail,
          customer_name: customerName,
          sales_channel: "website",
        })
        .select("id")
        .single();
      if (orderError) throw orderError;
      orderId = order.id;
    }
    if (!orderId) {
      throw new Error("Unable to initialize order for checkout");
    }

    const { count: existingItemsCount, error: existingItemsCountError } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId);
    if (existingItemsCountError) throw existingItemsCountError;

    if ((existingItemsCount ?? 0) === 0) {
      await reserveStockForOrder(supabase, orderId, resolvedItems);
      reservedStock = true;

      const { error: insertItemsError } = await supabase.from("order_items").insert(
        resolvedItems.map((line) => ({
          order_id: orderId,
          product_id: line.product.id,
          variant_id: line.variant?.id ?? null,
          product_name: line.product.name,
          sku: line.variant?.sku ?? line.product.sku,
          variant_size: line.variant?.size ?? line.item.size ?? null,
          variant_material: line.variant?.material ?? line.item.material ?? null,
          quantity: line.requestedQuantity,
          price_at_purchase: line.product.price,
          line_item_meta: {
            product_slug: line.product.slug,
            cart_item_id: line.item.id ?? line.product.id,
            size: line.variant?.size ?? line.item.size ?? null,
            material: line.variant?.material ?? line.item.material ?? null,
          },
        }))
      );
      if (insertItemsError) throw insertItemsError;
    }

    const intent = await createAirwallexPaymentIntent({
      requestId,
      amount: total,
      currency: selectedCurrency,
      merchantOrderId: orderId,
      returnUrl: `${returnUrl}&order_id=${encodeURIComponent(orderId)}`,
      customer: {
        email: customerEmail,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
      },
      metadata: {
        order_id: orderId,
        sales_channel: "website",
      },
    });

    if (!intent.client_secret) {
      throw new Error("Airwallex did not return a client secret");
    }

    await upsertAirwallexPaymentIntent(supabase, {
      orderId,
      requestId,
      intent,
    });
    await applyAirwallexPaymentIntentStatus(supabase, {
      paymentIntentId: intent.id,
      nextStatus: normalizeAirwallexPaymentStatus(intent.status),
      providerEventCreatedAt: intent.updated_at ?? null,
      force: true,
    });

    const { error: orderUpdateError } = await supabase
      .from("orders")
      .update({
        payment_reference: intent.id,
        payment_provider: "airwallex",
        payment_status: normalizeAirwallexPaymentStatus(intent.status),
        fulfillment_status: "pending_payment",
        currency: selectedCurrency,
        subtotal_amount: subtotal,
        shipping_amount: shippingAmount,
        total_amount: total,
        customer_email: customerEmail,
        customer_name: customerName,
        shipping_address: shippingAddress,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);
    if (orderUpdateError) throw orderUpdateError;

    return NextResponse.json(
      {
        orderId,
        intentId: intent.id,
        clientSecret: intent.client_secret,
        currency: selectedCurrency,
        sdkEnv: getAirwallexSdkEnvironment(),
        countryCode: toCountryCode(customer.country),
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    if (supabase && orderId && reservedStock && resolvedItems.length) {
      try {
        await restoreStockForOrder(supabase, orderId, resolvedItems);
      } catch (restoreError) {
        console.error("[airwallex-checkout] failed to restore stock after error", restoreError);
        return NextResponse.json(
          {
            error:
              restoreError instanceof Error
                ? restoreError.message
                : "Checkout failed and inventory restore could not complete",
          },
          { status: 500 }
        );
      }
    }

    if (supabase && orderId) {
      const { error: markFailedError } = await supabase
        .from("orders")
        .update({
          payment_provider: "airwallex",
          payment_status: "failed",
          status: "failed",
          fulfillment_status: "payment_failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);
      if (markFailedError) {
        console.error("[airwallex-checkout] failed to mark order as failed", markFailedError);
      }
    }

    console.error("[airwallex-checkout]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to initialize Airwallex payment",
      },
      { status: 500 }
    );
  }
}
