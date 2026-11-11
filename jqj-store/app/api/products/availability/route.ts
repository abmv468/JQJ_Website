import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchInventoryBySlugs,
  type CheckoutItemInput,
  validateCheckoutItems,
} from "@/lib/inventory";
import { getStockState } from "@/lib/product-stock";

export const dynamic = "force-dynamic";

function availabilityReference() {
  return randomBytes(4).toString("hex");
}

function databaseErrorCode(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  if (typeof code !== "string" || !/^[A-Za-z0-9_]{1,32}$/.test(code)) return "unknown";
  return code;
}

function availabilityUnavailable(error: unknown) {
  const reference = availabilityReference();
  console.error("[availability] read failed", {
    reference,
    code: databaseErrorCode(error),
  });
  return NextResponse.json(
    { error: "Availability temporarily unavailable", reference },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}

async function loadInventory(slugs: string[]) {
  try {
    const supabase = createAdminClient();
    return { ok: true as const, inventory: await fetchInventoryBySlugs(supabase, slugs) };
  } catch (error) {
    return { ok: false as const, response: availabilityUnavailable(error) };
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const loaded = await loadInventory([slug]);
  if (!loaded.ok) return loaded.response;

  const product = loaded.inventory.get(slug);
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const stock = getStockState({
    stockCount: product.stock_count,
    inStock: product.in_stock,
    lowStockThreshold: product.low_stock_threshold,
    variants:
      product.product_variants?.map((variant) => ({
        id: variant.id,
        size: variant.size,
        material: variant.material,
        sku: variant.sku,
        stockCount: variant.stock_count,
      })) ?? [],
  });

  return NextResponse.json({
    product: {
      id: product.id,
      slug: product.slug,
      sku: product.sku,
      lowStockThreshold: stock.lowStockThreshold,
      inStock: stock.inStock,
      stockCount: stock.availableStock,
      hasVariants: stock.hasVariants,
      variants:
        product.product_variants?.map((variant) => ({
          id: variant.id,
          size: variant.size,
          material: variant.material,
          sku: variant.sku,
          stockCount: variant.stock_count,
          inStock: variant.stock_count > 0,
        })) ?? [],
    },
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { items?: CheckoutItemInput[] };
  const items = body.items ?? [];
  if (!items.length) {
    return NextResponse.json({ ok: true, items: [], errors: [] });
  }

  const slugs = Array.from(new Set(items.map((item) => item.slug).filter(Boolean) as string[]));
  const loaded = await loadInventory(slugs);
  if (!loaded.ok) return loaded.response;

  const validated = validateCheckoutItems(items, loaded.inventory);

  return NextResponse.json({
    ok: validated.ok,
    errors: validated.errors,
    items: validated.resolved.map((line) => ({
      slug: line.product.slug,
      name: line.product.name,
      requestedQuantity: line.requestedQuantity,
      availableQuantity: line.availableQuantity,
      sku: line.variant?.sku ?? line.product.sku,
      size: line.variant?.size ?? line.item.size ?? null,
      material: line.variant?.material ?? line.item.material ?? null,
      variantId: line.variant?.id ?? null,
      lowStock: line.availableQuantity <= Math.max(1, Number(line.product.low_stock_threshold ?? 5)),
    })),
  });
}
