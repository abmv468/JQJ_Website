import { NextResponse } from "next/server";
import { checkoutErrorResponse } from "@/lib/checkout-error";
import { computeShippingUsd, type MerchandiseLine } from "@/lib/checkout-shipping";
import {
  fetchInventoryBySlugs,
  validateCheckoutItems,
  type CheckoutItemInput,
} from "@/lib/inventory";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MAX_QUOTE_LINES = 50;
const MAX_QUOTE_QUANTITY = 99;

function usdCents(amount: number | string) {
  const cents = Math.round(Number(amount) * 100);
  if (!Number.isFinite(cents)) throw new Error("USD amount must be a finite number");
  return cents;
}

function invalidRequest() {
  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}

export async function POST(req: Request) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return invalidRequest();
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return invalidRequest();
    }

    // shippingCountry is accepted and unused. Shipping is still the flat USD rule.
    const items = (body as { items?: unknown }).items;
    if (!Array.isArray(items)) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }
    if (items.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }
    if (items.length > MAX_QUOTE_LINES) {
      return NextResponse.json({ error: "Your cart has too many items." }, { status: 400 });
    }

    const parsed: CheckoutItemInput[] = [];
    for (const entry of items) {
      if (!entry || typeof entry !== "object") return invalidRequest();
      const item = entry as Record<string, unknown>;
      const quantity = item.quantity;
      if (
        typeof quantity !== "number" ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > MAX_QUOTE_QUANTITY
      ) {
        return NextResponse.json({ error: "Enter a quantity from 1 to 99." }, { status: 400 });
      }
      parsed.push({
        id: typeof item.id === "string" ? item.id : undefined,
        slug: typeof item.slug === "string" ? item.slug : undefined,
        name: typeof item.name === "string" ? item.name : "",
        price: typeof item.price === "number" ? item.price : 0,
        quantity,
        size: typeof item.size === "string" ? item.size : undefined,
        material: typeof item.material === "string" ? item.material : undefined,
        sku: typeof item.sku === "string" ? item.sku : undefined,
      });
    }

    const supabase = createAdminClient();
    const slugs = Array.from(new Set(parsed.map((item) => item.slug?.trim()).filter(Boolean) as string[]));
    const inventoryBySlug = await fetchInventoryBySlugs(supabase, slugs);
    const validation = validateCheckoutItems(parsed, inventoryBySlug);
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.errors[0] || "An item in your cart is unavailable." },
        { status: 409 }
      );
    }

    const merchandise: MerchandiseLine[] = [];
    const lines: {
      productId: string;
      variantId?: string;
      quantity: number;
      unitPriceUsd: number;
      lineTotalUsd: number;
    }[] = [];
    let subtotalCents = 0;
    for (const line of validation.resolved) {
      const unitCents = usdCents(line.product.price);
      const lineCents = unitCents * line.requestedQuantity;
      subtotalCents += lineCents;
      lines.push({
        productId: line.product.id,
        ...(line.variant ? { variantId: line.variant.id } : {}),
        quantity: line.requestedQuantity,
        unitPriceUsd: unitCents / 100,
        lineTotalUsd: lineCents / 100,
      });
      merchandise.push({ unitPriceUsd: unitCents / 100, quantity: line.requestedQuantity });
    }

    const subtotalUsd = subtotalCents / 100;
    const shippingUsd = computeShippingUsd(merchandise);
    const totalUsd = (subtotalCents + shippingUsd * 100) / 100;
    return NextResponse.json(
      { subtotalUsd, shippingUsd, totalUsd, lines },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return checkoutErrorResponse("checkout-quote", error);
  }
}
