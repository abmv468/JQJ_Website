import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOrderEmails } from "@/lib/email";
import { convertCurrencyToUsd, normalizeCurrency } from "@/lib/currency";
import {
  fetchInventoryBySlugs,
  restoreStockForOrder,
  reserveStockForOrder,
  validateCheckoutItems,
  type CheckoutItemInput,
} from "@/lib/inventory";

export const dynamic = "force-dynamic";
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asUuid(value: string | undefined) {
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
  try {
    const { sessionId } = (await req.json()) as { sessionId: string };
    if (!sessionId) {
      return NextResponse.json({ error: "Missing session id" }, { status: 400 });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items"],
    });

    if (session.payment_status !== "paid") {
      return NextResponse.json({ error: "Payment not completed" }, { status: 402 });
    }

    const meta = session.metadata ?? {};
    const selectedCurrency = normalizeCurrency(meta.currency);
    const shipping = Number(meta.shipping || 0);
    const chargedTotal = (session.amount_total ?? 0) / 100;
    const chargedTotalUsd = convertCurrencyToUsd(chargedTotal, selectedCurrency);
    let subtotal = 0;
    let total = 0;
    const customerEmail = session.customer_details?.email || "";
    const customerName = meta.customerName || session.customer_details?.name || "";
    const userId = asUuid(meta.userId) ?? (await getAuthenticatedUserId());

    let items: CheckoutItemInput[] = [];
    try {
      items = (JSON.parse(meta.items || "[]") as Array<{
        id?: string;
        s?: string;
        n: string;
        p: number;
        q: number;
        sz?: string;
        m?: string;
        sku?: string;
      }>).map((item) => ({
        id: item.id,
        slug: item.s,
        name: item.n,
        price: item.p,
        quantity: item.q,
        size: item.sz,
        material: item.m,
        sku: item.sku,
      }));
    } catch {
      return NextResponse.json({ error: "Invalid checkout metadata" }, { status: 422 });
    }

    if (!items.length) {
      return NextResponse.json({ error: "Missing checkout items metadata" }, { status: 422 });
    }

    const shippingAddress = {
      address: meta.address || "",
      apartment: meta.apartment || "",
      city: meta.city || "",
      region: meta.region || "",
      country: meta.country || "",
      phone: meta.phone || "",
      payment_method: "stripe" as const,
      currency: selectedCurrency,
    };

    const supabase = createAdminClient();

    // Idempotency: don't double-create on repeated verify calls.
    const { data: existing } = await supabase
      .from("orders")
      .select("id, user_id")
      .eq("stripe_session_id", session.id)
      .maybeSingle();

    let orderId: string | null = null;
    let reusedIncompleteOrder = false;

    if (existing) {
      if (!existing.user_id && userId) {
        await supabase.from("orders").update({ user_id: userId }).eq("id", existing.id);
      }
      const { count, error: itemCountError } = await supabase
        .from("order_items")
        .select("id", { count: "exact", head: true })
        .eq("order_id", existing.id);
      if (itemCountError) throw itemCountError;

      if ((count ?? 0) > 0) {
        return NextResponse.json({ orderId: existing.id }, { headers: { "Cache-Control": "no-store" } });
      }

      orderId = existing.id;
      reusedIncompleteOrder = true;
    }

    const slugs = Array.from(new Set(items.map((item) => item.slug).filter(Boolean) as string[]));
    const inventoryBySlug = await fetchInventoryBySlugs(supabase, slugs);
    const validation = validateCheckoutItems(items, inventoryBySlug);
    if (!validation.ok) {
      const { data: existingException } = await supabase
        .from("orders")
        .select("id, user_id")
        .eq("stripe_session_id", session.id)
        .maybeSingle();

      let exceptionOrderId = existingException?.id ?? null;
      if (existingException && !existingException.user_id && userId) {
        await supabase.from("orders").update({ user_id: userId }).eq("id", existingException.id);
      }
      if (!exceptionOrderId) {
        const { data: exceptionOrder, error: exceptionInsertError } = await supabase
          .from("orders")
          .insert({
            user_id: userId,
            status: "inventory_exception",
            verification_completed: true,
            verification_claimed_at: new Date().toISOString(),
            total_amount: total,
            shipping_amount: shipping,
            shipping_address: shippingAddress,
            customer_email: customerEmail,
            customer_name: customerName,
            stripe_session_id: session.id,
          })
          .select("id")
          .single();
        if (exceptionInsertError) {
          if ((exceptionInsertError as { code?: string }).code === "23505") {
            const { data: deduped } = await supabase
              .from("orders")
              .select("id")
              .eq("stripe_session_id", session.id)
              .maybeSingle();
            exceptionOrderId = deduped?.id ?? null;
          } else {
            throw exceptionInsertError;
          }
        } else {
          exceptionOrderId = exceptionOrder.id;
        }
      }

      if (!exceptionOrderId) {
        throw new Error("Unable to persist paid order exception");
      }

      const { count: exceptionItemCount, error: exceptionCountError } = await supabase
        .from("order_items")
        .select("id", { count: "exact", head: true })
        .eq("order_id", exceptionOrderId);
      if (exceptionCountError) throw exceptionCountError;

      if ((exceptionItemCount ?? 0) === 0) {
        const { error: exceptionItemsError } = await supabase.from("order_items").insert(
          items.map((item) => ({
            order_id: exceptionOrderId,
            product_id: null,
            variant_id: null,
            product_name: item.name,
            sku: item.sku ?? null,
            variant_size: item.size ?? null,
            variant_material: item.material ?? null,
            quantity: item.quantity,
            price_at_purchase: item.price,
          }))
        );
        if (exceptionItemsError) throw exceptionItemsError;
      }

      return NextResponse.json(
        { orderId: exceptionOrderId, warning: validation.errors[0] || "Inventory issue detected after payment" },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    subtotal = validation.resolved.reduce(
      (sum, line) => sum + line.product.price * line.requestedQuantity,
      0
    );
    total = subtotal + shipping;

    // Guard against rare FX/rounding drift between charged amount and USD normalization.
    if (Math.abs(chargedTotalUsd - total) > 0.03) {
      total = chargedTotalUsd;
      subtotal = Math.max(0, total - shipping);
    }

    const claimVerification = async (targetOrderId: string) => {
      const { data: currentOrder, error: currentOrderError } = await supabase
        .from("orders")
        .select("verification_completed, verification_claimed_at, inventory_reserved")
        .eq("id", targetOrderId)
        .single();
      if (currentOrderError) throw currentOrderError;

      if (currentOrder.verification_completed) {
        const { count, error: existingItemsError } = await supabase
          .from("order_items")
          .select("id", { count: "exact", head: true })
          .eq("order_id", targetOrderId);
        if (existingItemsError) throw existingItemsError;
        if ((count ?? 0) > 0) {
          return { state: "complete" as const, inventoryReserved: currentOrder.inventory_reserved };
        }

        const claimedAt = currentOrder.verification_claimed_at
          ? new Date(currentOrder.verification_claimed_at).getTime()
          : 0;
        if (Date.now() - claimedAt < CLAIM_TIMEOUT_MS) {
          return { state: "in_progress" as const, inventoryReserved: currentOrder.inventory_reserved };
        }

        const { error: staleResetError } = await supabase
          .from("orders")
          .update({ verification_completed: false, verification_claimed_at: null })
          .eq("id", targetOrderId);
        if (staleResetError) throw staleResetError;
      }

      const { data: claimRow, error: claimError } = await supabase
        .from("orders")
        .update({
          verification_completed: true,
          verification_claimed_at: new Date().toISOString(),
          status: "processing",
          total_amount: total,
          shipping_amount: shipping,
          shipping_address: shippingAddress,
          customer_email: customerEmail,
          customer_name: customerName,
        })
        .eq("id", targetOrderId)
        .eq("verification_completed", false)
        .select("id")
        .maybeSingle();
      if (claimError) throw claimError;
      if (claimRow) {
        return { state: "claimed" as const, inventoryReserved: currentOrder.inventory_reserved };
      }
      return { state: "in_progress" as const, inventoryReserved: currentOrder.inventory_reserved };
    };

    if (!orderId) {
      const { data: order, error: orderInsertError } = await supabase
        .from("orders")
        .insert({
          user_id: userId,
          verification_completed: false,
          inventory_reserved: false,
          total_amount: total,
          shipping_amount: shipping,
          shipping_address: shippingAddress,
          customer_email: customerEmail,
          customer_name: customerName,
          stripe_session_id: session.id,
        })
        .select("id")
        .single();

      if (orderInsertError) {
        if ((orderInsertError as { code?: string }).code === "23505") {
          const { data: deduped } = await supabase
            .from("orders")
            .select("id")
            .eq("stripe_session_id", session.id)
            .maybeSingle();
          if (deduped) {
            const { count, error: dedupedCountError } = await supabase
              .from("order_items")
              .select("id", { count: "exact", head: true })
              .eq("order_id", deduped.id);
            if (dedupedCountError) throw dedupedCountError;

            if ((count ?? 0) > 0) {
              return NextResponse.json({ orderId: deduped.id }, { headers: { "Cache-Control": "no-store" } });
            }

            orderId = deduped.id;
            reusedIncompleteOrder = true;
          }
        }
        if (!orderId) throw orderInsertError;
      } else {
        orderId = order.id;
      }
    }

    const claimResult = await claimVerification(orderId!);
    if (claimResult.state === "complete") {
      return NextResponse.json({ orderId }, { headers: { "Cache-Control": "no-store" } });
    }
    if (claimResult.state === "in_progress") {
      return NextResponse.json(
        { error: "Order verification is in progress. Please retry in a moment." },
        { status: 409 }
      );
    }

    let stockReserved = false;

    try {
      if (!claimResult.inventoryReserved) {
        await reserveStockForOrder(supabase, orderId!, validation.resolved);
        stockReserved = true;
      }

      if (validation.resolved.length) {
        const { error: itemError } = await supabase.from("order_items").insert(
          validation.resolved.map((line) => ({
            order_id: orderId!,
            product_id: line.product.id,
            variant_id: line.variant?.id ?? null,
            product_name: line.product.name,
            sku: line.variant?.sku ?? line.product.sku,
            variant_size: line.variant?.size ?? line.item.size ?? null,
            variant_material: line.variant?.material ?? line.item.material ?? null,
            quantity: line.requestedQuantity,
            price_at_purchase: line.item.price,
          }))
        );
        if (itemError) throw itemError;
      }
    } catch (persistError) {
      let restoreError: unknown = null;
      if (stockReserved) {
        try {
          await restoreStockForOrder(supabase, orderId!, validation.resolved);
        } catch (err) {
          restoreError = err;
        }
      }
      if (reusedIncompleteOrder) {
        await supabase
          .from("orders")
          .update({
            status: "failed",
            verification_completed: false,
            verification_claimed_at: null,
          })
          .eq("id", orderId);
      } else {
        await supabase
          .from("orders")
          .update({
            status: "failed_fulfillment",
            verification_completed: false,
            verification_claimed_at: null,
          })
          .eq("id", orderId);
      }
      if (restoreError) {
        throw restoreError;
      }
      throw persistError;
    }

    await sendOrderEmails({
      orderId: orderId!,
      customerName,
      customerEmail,
      items: validation.resolved.map((line) => ({
        name:
          line.product.name +
          ((line.variant?.size || line.variant?.material)
            ? ` (${[line.variant?.size, line.variant?.material].filter(Boolean).join(" / ")})`
            : ""),
        quantity: line.requestedQuantity,
        price: line.item.price,
      })),
      subtotal,
      shipping,
      total,
      paymentMethod: "stripe",
      currency: selectedCurrency,
      shippingAddress,
    });

    return NextResponse.json({ orderId }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[verify]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Verification failed" },
      { status: 500 }
    );
  }
}
