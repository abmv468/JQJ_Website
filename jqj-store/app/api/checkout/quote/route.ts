import { NextResponse } from "next/server";
import { checkoutErrorResponse } from "@/lib/checkout-error";
import { computeShippingUsd, sumMerchandiseUsd, type MerchandiseLine } from "@/lib/checkout-shipping";
import { fetchInventoryBySlugs, type InventoryProduct } from "@/lib/inventory";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PRODUCT_COLUMNS =
  "id, slug, name, price, stock_count, in_stock, low_stock_threshold, sku, product_variants(id, product_id, size, material, sku, stock_count)";

async function fetchProductsById(
  supabase: ReturnType<typeof createAdminClient>,
  ids: string[]
) {
  if (!ids.length) return new Map<string, InventoryProduct>();
  const { data, error } = await supabase.from("products").select(PRODUCT_COLUMNS).in("id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((product) => [product.id, product as InventoryProduct]));
}

export async function POST(req: Request) {
  try {
    let body: { items?: unknown };
    try {
      body = (await req.json()) as { items?: unknown };
    } catch {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    const parsed: { id: string; slug: string; quantity: number }[] = [];
    for (const entry of items) {
      const item = entry as { id?: unknown; slug?: unknown; quantity?: unknown };
      const id = typeof item?.id === "string" ? item.id.trim() : "";
      const slug = typeof item?.slug === "string" ? item.slug.trim() : "";
      const quantity = Math.floor(Number(item?.quantity));
      if (!id && !slug) {
        return NextResponse.json(
          { error: "An item in your cart is unavailable." },
          { status: 400 }
        );
      }
      if (!Number.isFinite(quantity) || quantity < 1) {
        return NextResponse.json(
          { error: "Check the highlighted fields.", fields: { quantity: "Enter a quantity of at least 1." } },
          { status: 400 }
        );
      }
      parsed.push({ id, slug, quantity });
    }

    const supabase = createAdminClient();
    const slugs = Array.from(new Set(parsed.map((item) => item.slug).filter(Boolean)));
    const bySlug = await fetchInventoryBySlugs(supabase, slugs);
    const missingIds = Array.from(
      new Set(
        parsed
          .filter((item) => !(item.slug && bySlug.get(item.slug)) && item.id)
          .map((item) => item.id)
      )
    );
    const byId = await fetchProductsById(supabase, missingIds);

    const lines: MerchandiseLine[] = [];
    for (const item of parsed) {
      const product = (item.slug && bySlug.get(item.slug)) || (item.id && byId.get(item.id)) || null;
      if (!product) {
        return NextResponse.json(
          { error: "An item in your cart is unavailable." },
          { status: 400 }
        );
      }
      lines.push({ unitPriceUsd: product.price, quantity: item.quantity });
    }

    const subtotalUsd = sumMerchandiseUsd(lines);
    const shippingUsd = computeShippingUsd(lines);
    const totalUsd = (Math.round(subtotalUsd * 100) + shippingUsd * 100) / 100;
    return NextResponse.json(
      { subtotalUsd, shippingUsd, totalUsd },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return checkoutErrorResponse("checkout-quote", error);
  }
}
