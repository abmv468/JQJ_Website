import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { products } from "@/data/products";
import {
  fetchInventoryBySlugs,
  type CheckoutItemInput,
  type InventoryProduct,
  validateCheckoutItems,
} from "@/lib/inventory";
import { getStockState } from "@/lib/product-stock";

export const dynamic = "force-dynamic";

function buildFallbackProduct(slug: string) {
  const product = products.find((entry) => entry.slug === slug);
  if (!product) return null;
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    price: product.price,
    stock_count: product.stockCount,
    in_stock: product.inStock,
    low_stock_threshold: product.lowStockThreshold ?? 5,
    sku: product.sku ?? null,
    product_variants:
      product.variants?.map((variant, index) => ({
        id: `${product.id}-${index}`,
        product_id: product.id,
        size: variant.size ?? null,
        material: variant.material ?? null,
        sku: variant.sku,
        stock_count: variant.stockCount,
      })) ?? [],
  };
}

async function getInventory(slugs: string[]): Promise<Map<string, InventoryProduct>> {
  try {
    const supabase = createAdminClient();
    return await fetchInventoryBySlugs(supabase, slugs);
  } catch {
    return new Map<string, InventoryProduct>(
      slugs
        .map((slug) => buildFallbackProduct(slug))
        .filter(Boolean)
        .map((product) => [product!.slug, product! as InventoryProduct])
    );
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const inventory = await getInventory([slug]);
  const product = inventory.get(slug);
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
  const inventory = await getInventory(slugs);
  const validated = validateCheckoutItems(items, inventory);

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
