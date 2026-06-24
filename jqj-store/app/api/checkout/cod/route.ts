import { NextResponse } from "next/server";
import { createHash } from "crypto";
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

const COD_FEE = 20;
const SHIPPING_FLAT = 15;
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const { items, customer, idempotencyKey } = (await req.json()) as {
      items: CheckoutItemInput[];
      customer: Record<string, string>;
      idempotencyKey?: string;
    };

    if (!items?.length) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    const shippingAmount = items.length ? SHIPPING_FLAT : 0;
    const customerName = `${customer.firstName} ${customer.lastName}`.trim();

    const shippingAddress = {
      address: customer.address,
      apartment: customer.apartment,
      city: customer.city,
      region: customer.region,
      country: customer.country,
      phone: customer.phone,
      payment_method: "cod" as const,
      cod_fee: COD_FEE,
    };

    const supabase = createAdminClient();
    const derivedKey =
      idempotencyKey?.trim() ||
      createHash("sha256")
        .update(
          JSON.stringify({
            customerEmail: customer.email,
            items: items.map((item) => ({
              slug: item.slug,
              quantity: item.quantity,
              size: item.size,
              material: item.material,
              sku: item.sku,
            })),
            shippingAddress,
            shipping: shippingAmount,
          })
        )
        .digest("hex")
        .slice(0, 24);
    const codSessionId = `COD-${derivedKey}`;

    const { data: existing } = await supabase
      .from("orders")
      .select("id")
      .eq("stripe_session_id", codSessionId)
      .maybeSingle();
    if (existing) {
      const { count, error: existingCountError } = await supabase
        .from("order_items")
        .select("id", { count: "exact", head: true })
        .eq("order_id", existing.id);
      if (existingCountError) throw existingCountError;

      if ((count ?? 0) > 0) {
        return NextResponse.json({ orderId: existing.id }, { headers: { "Cache-Control": "no-store" } });
      }
    }

    const slugs = Array.from(new Set(items.map((item) => item.slug).filter(Boolean) as string[]));
    const inventoryBySlug = await fetchInventoryBySlugs(supabase, slugs);
    const validation = validateCheckoutItems(items, inventoryBySlug);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.errors[0] || "Insufficient stock" }, { status: 409 });
    }

    const subtotal = validation.resolved.reduce(
      (sum, line) => sum + line.product.price * line.requestedQuantity,
      0
    );
    const total = subtotal + shippingAmount + COD_FEE;

    let orderId: string | null = existing?.id ?? null;
    let reusedIncompleteOrder = Boolean(orderId);
    let stockReserved = false;

    const claimOrder = async (targetOrderId: string) => {
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

      const { data: claimed, error: claimError } = await supabase
        .from("orders")
        .update({
          verification_completed: true,
          verification_claimed_at: new Date().toISOString(),
          status: "pending",
        .insert({
          status: "paid",
          total_amount: total,
          shipping_amount: shippingAmount,
          shipping_address: shippingAddress,
          customer_email: customer.email,
          customer_name: customerName,
        })
        .eq("id", targetOrderId)
        .eq("verification_completed", false)
        .select("id")
        .maybeSingle();
      if (claimError) throw claimError;
      if (claimed) return { state: "claimed" as const, inventoryReserved: currentOrder.inventory_reserved };
      return { state: "in_progress" as const, inventoryReserved: currentOrder.inventory_reserved };
    };

    try {
      if (orderId) {
        const claimResult = await claimOrder(orderId);
        if (claimResult.state === "complete") {
          return NextResponse.json({ orderId }, { headers: { "Cache-Control": "no-store" } });
        }
        if (claimResult.state === "in_progress") {
          return NextResponse.json(
            { error: "Order processing is in progress. Please retry." },
            { status: 409 }
          );
        }
        if (!claimResult.inventoryReserved) {
          await reserveStockForOrder(supabase, orderId, validation.resolved);
          stockReserved = true;
        }
      } else {
        const { data: order, error } = await supabase
          .from("orders")
          .insert({
            status: "pending",
            verification_completed: false,
            inventory_reserved: false,
            total_amount: total,
            shipping_amount: shippingAmount,
            shipping_address: shippingAddress,
            customer_email: customer.email,
            customer_name: customerName,
            stripe_session_id: codSessionId,
          })
          .select("id")
          .single();

        if (error) {
          if ((error as { code?: string }).code === "23505") {
            const { data: deduped } = await supabase
              .from("orders")
              .select("id")
              .eq("stripe_session_id", codSessionId)
              .maybeSingle();
            if (deduped) {
              orderId = deduped.id;
              reusedIncompleteOrder = true;
            }
          }
          if (!orderId) {
            throw error;
          }
        }
        if (!orderId) {
          orderId = order?.id ?? null;
        }
        if (!orderId) {
          throw new Error("Unable to create COD order");
        }

        const claimResult = await claimOrder(orderId);
        if (claimResult.state === "complete") {
          return NextResponse.json({ orderId }, { headers: { "Cache-Control": "no-store" } });
        }
        if (claimResult.state === "in_progress") {
          return NextResponse.json(
            { error: "Order processing is in progress. Please retry." },
            { status: 409 }
          );
        }
        if (!claimResult.inventoryReserved) {
          await reserveStockForOrder(supabase, orderId, validation.resolved);
          stockReserved = true;
        }
      }

      const { error: itemError } = await supabase.from("order_items").insert(
        validation.resolved.map((line) => ({
          order_id: orderId,
          product_id: line.product.id,
          variant_id: line.variant?.id ?? null,
          product_name: line.product.name,
          sku: line.variant?.sku ?? line.product.sku,
          variant_size: line.variant?.size ?? line.item.size ?? null,
          variant_material: line.variant?.material ?? line.item.material ?? null,
          quantity: line.requestedQuantity,
          price_at_purchase: line.product.price,
        }))
      );
      if (itemError) throw itemError;
    } catch (persistError) {
      let restoreError: unknown = null;
      if (stockReserved) {
        try {
          await restoreStockForOrder(supabase, orderId!, validation.resolved);
        } catch (err) {
          restoreError = err;
        }
      }
      if (orderId) {
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
          await supabase.from("orders").delete().eq("id", orderId);
        }
      }
      if (restoreError) {
        throw restoreError;
      }
      throw persistError;
    }

    if (!orderId) {
      throw new Error("Order was not created.");
    }

    await sendOrderEmails({
      orderId,
      customerName,
      customerEmail: customer.email,
      items: validation.resolved.map((line) => ({
        name:
          line.product.name +
          (line.variant
            ? ` (${[line.variant.size, line.variant.material].filter(Boolean).join(" / ")})`
            : ""),
        quantity: line.requestedQuantity,
        price: line.product.price,
      })),
      subtotal,
      shipping: shippingAmount,
      codFee: COD_FEE,
      total,
      paymentMethod: "cod",
      shippingAddress,
    });

    return NextResponse.json({ orderId }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[cod]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Order failed" },
      { status: 500 }
    );
  }
}
