import { NextResponse } from "next/server";
import { checkoutErrorResponse } from "@/lib/checkout-error";
import { computeShippingUsd, type MerchandiseLine } from "@/lib/checkout-shipping";
import { fetchInventoryBySlugs, type InventoryProduct } from "@/lib/inventory";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PRODUCT_COLUMNS =
  "id, slug, name, price, stock_count, in_stock, low_stock_threshold, sku, product_variants(id, product_id, size, material, sku, stock_count)";

type QuoteItem = {
  id: string;
  slug: string;
  quantity: number;
  sku: string;
  size: string;
  material: string;
  variantId: string;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function matchVariant(product: InventoryProduct, item: QuoteItem) {
  const variants = product.product_variants ?? [];
  if (!variants.length) return null;
  if (!item.variantId && !item.sku && !item.size && !item.material) return null;

  if (item.variantId) {
    const byId = variants.find((variant) => variant.id === item.variantId);
    if (byId) return byId;
  }
  if (item.sku) {
    const bySku = variants.find((variant) => variant.sku === item.sku);
    if (bySku) return bySku;
  }
  if (item.size || item.material) {
    return (
      variants.find((variant) => {
        const sizeMatch = item.size ? normalize(variant.size ?? "") === normalize(item.size) : true;
        const materialMatch = item.material
          ? normalize(variant.material ?? "") === normalize(item.material)
          : true;
        return sizeMatch && materialMatch;
      }) ?? null
    );
  }
  return null;
}

function usdCents(amount: number | string) {
  const cents = Math.round(Number(amount) * 100);
  if (!Number.isFinite(cents)) throw new Error("USD amount must be a finite number");
  return cents;
}

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

    const parsed: QuoteItem[] = [];
    for (const entry of items) {
      const item = entry as {
        id?: unknown;
        slug?: unknown;
        quantity?: unknown;
        sku?: unknown;
        size?: unknown;
        material?: unknown;
        variantId?: unknown;
      };
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
      parsed.push({
        id,
        slug,
        quantity,
        sku: typeof item.sku === "string" ? item.sku.trim() : "",
        size: typeof item.size === "string" ? item.size.trim() : "",
        material: typeof item.material === "string" ? item.material.trim() : "",
        variantId: typeof item.variantId === "string" ? item.variantId.trim() : "",
      });
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

    const merchandise: MerchandiseLine[] = [];
    const lines: {
      productId: string;
      variantId?: string;
      quantity: number;
      unitPriceUsd: number;
      lineTotalUsd: number;
    }[] = [];
    let subtotalCents = 0;
    for (const item of parsed) {
      const product = (item.slug && bySlug.get(item.slug)) || (item.id && byId.get(item.id)) || null;
      if (!product) {
        return NextResponse.json(
          { error: "An item in your cart is unavailable." },
          { status: 400 }
        );
      }
      const variant = matchVariant(product, item);
      const unitCents = usdCents(product.price);
      const lineCents = unitCents * item.quantity;
      subtotalCents += lineCents;
      lines.push({
        productId: product.id,
        ...(variant ? { variantId: variant.id } : {}),
        quantity: item.quantity,
        unitPriceUsd: unitCents / 100,
        lineTotalUsd: lineCents / 100,
      });
      merchandise.push({ unitPriceUsd: unitCents / 100, quantity: item.quantity });
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
