import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOrderEmails } from "@/lib/email";
import {
  fetchInventoryBySlugs,
  restoreStockForOrder,
  reserveStockForOrder,
  validateCheckoutItems,
  type CheckoutItemInput,
} from "@/lib/inventory";

export const dynamic = "force-dynamic";
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

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
    const shipping = Number(meta.shipping || 0);
    const total = (session.amount_total ?? 0) / 100;
    const subtotal = total - shipping;
    const customerEmail = session.customer_details?.email || "";
    const customerName = meta.customerName || session.customer_details?.name || "";

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
      payment_method: "stripe" as const,
    };

    const supabase = createAdminClient();

    // Idempotency: don't double-create on repeated verify calls.
    const { data: existing } = await supabase
      .from("orders")
      .select("id")
      .eq("stripe_session_id", session.id)
      .maybeSingle();

    let orderId: string | null = null;
    let reusedIncompleteOrder = false;

    if (existing) {
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
        .select("id")
        .eq("stripe_session_id", session.id)
        .maybeSingle();

      let exceptionOrderId = existingException?.id ?? null;
      if (!exceptionOrderId) {
        const { data: exceptionOrder, error: exceptionInsertError } = await supabase
          .from("orders")
          .insert({
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
          status: "processing",
          verification_completed: false,
          inventory_reserved: false,
          status: "paid",
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
