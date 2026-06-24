import type { SupabaseClient } from "@supabase/supabase-js";

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface CheckoutItemInput {
  id?: string;
  slug?: string;
  name: string;
  price: number;
  quantity: number;
  size?: string;
  material?: string;
  sku?: string;
}

export interface InventoryVariant {
  id: string;
  product_id: string;
  size: string | null;
  material: string | null;
  sku: string;
  stock_count: number;
}

export interface InventoryProduct {
  id: string;
  slug: string;
  name: string;
  price: number;
  stock_count: number;
  in_stock: boolean;
  low_stock_threshold: number | null;
  sku: string | null;
  product_variants: InventoryVariant[] | null;
}

export interface ResolvedCheckoutItem {
  item: CheckoutItemInput;
  product: InventoryProduct;
  variant: InventoryVariant | null;
  requestedQuantity: number;
  availableQuantity: number;
}

export interface StockValidationResult {
  ok: boolean;
  resolved: ResolvedCheckoutItem[];
  errors: string[];
}

function normalize(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function toPositiveInt(value: number) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function hasVariants(product: InventoryProduct) {
  return Boolean(product.product_variants?.length);
}

function findVariant(product: InventoryProduct, item: CheckoutItemInput) {
  const variants = product.product_variants ?? [];
  if (!variants.length) return null;

  if (item.sku) {
    const bySku = variants.find((variant) => variant.sku === item.sku);
    if (bySku) return bySku;
  }

  const targetSize = normalize(item.size);
  const targetMaterial = normalize(item.material);
  if (targetSize || targetMaterial) {
    const byAttributes = variants.find((variant) => {
      const sizeMatch = targetSize ? normalize(variant.size) === targetSize : true;
      const materialMatch = targetMaterial
        ? normalize(variant.material) === targetMaterial
        : true;
      return sizeMatch && materialMatch;
    });
    if (byAttributes) return byAttributes;
  }

  return variants.length === 1 ? variants[0] : null;
}

export async function fetchInventoryBySlugs(
  supabase: SupabaseClient,
  slugs: string[]
): Promise<Map<string, InventoryProduct>> {
  if (!slugs.length) return new Map();

  const { data, error } = await supabase
    .from("products")
    .select(
      "id, slug, name, price, stock_count, in_stock, low_stock_threshold, sku, product_variants(id, product_id, size, material, sku, stock_count)"
    )
    .in("slug", slugs);

  if (error) throw error;

  return new Map((data ?? []).map((product) => [product.slug, product as InventoryProduct]));
}

export function validateCheckoutItems(
  items: CheckoutItemInput[],
  inventoryBySlug: Map<string, InventoryProduct>
): StockValidationResult {
  const errors: string[] = [];
  const resolved: ResolvedCheckoutItem[] = [];

  for (const item of items) {
    const quantity = toPositiveInt(item.quantity);
    const slug = item.slug?.trim();
    const product = slug ? inventoryBySlug.get(slug) : undefined;

    if (!product) {
      errors.push(`Product "${item.name}" is unavailable.`);
      continue;
    }

    const variant = findVariant(product, item);

    if (hasVariants(product) && !variant) {
      errors.push(`Select a valid size/material option for "${product.name}".`);
      continue;
    }

    const availableQuantity = variant
      ? toPositiveInt(variant.stock_count)
      : toPositiveInt(product.stock_count);

    if (quantity < 1) {
      errors.push(`Quantity for "${product.name}" must be at least 1.`);
      continue;
    }

    if (availableQuantity < quantity) {
      errors.push(
        availableQuantity > 0
          ? `"${product.name}" only has ${availableQuantity} item(s) left.`
          : `"${product.name}" is out of stock.`
      );
      continue;
    }

    resolved.push({
      item,
      product,
      variant,
      requestedQuantity: quantity,
      availableQuantity,
    });
  }

  return {
    ok: errors.length === 0,
    resolved,
    errors,
  };
}

export async function reserveStock(
  supabase: SupabaseClient,
  resolvedItems: ResolvedCheckoutItem[]
) {
  const reservations = buildReservations(resolvedItems);

  try {
    const { data, error } = await supabase.rpc("reserve_inventory", {
      order_items: reservations as unknown as Json,
    });

    if (error) throw error;

    const result = (data ?? []) as { success: boolean; message: string }[];
    const failed = result.find((row) => !row.success);
    if (failed) {
      throw new Error(failed.message || "Insufficient stock");
    }
    return;
  } catch (err) {
    if (err instanceof Error && (err.message.includes("stock") || err.message.includes("Stock"))) {
      throw err;
    }
    throw new Error("Inventory reservation failed. Please retry checkout.");
  }
}

export async function restoreStock(
  supabase: SupabaseClient,
  resolvedItems: ResolvedCheckoutItem[]
) {
  const reservations = buildReservations(resolvedItems);
  const { data, error } = await supabase.rpc("restore_inventory", {
    order_items: reservations as unknown as Json,
  });
  if (error) throw error;

  const result = (data ?? []) as { success: boolean; message: string }[];
  const failed = result.find((row) => !row.success);
  if (failed) {
    throw new Error(failed.message || "Stock restore failed");
  }
}

function buildReservations(resolvedItems: ResolvedCheckoutItem[]) {
  const aggregate = new Map<
    string,
    { product_id: string; variant_id: string | null; quantity: number }
  >();

  for (const line of resolvedItems) {
    const key = line.variant ? `v:${line.variant.id}` : `p:${line.product.id}`;
    const existing = aggregate.get(key);
    if (existing) {
      existing.quantity += line.requestedQuantity;
      continue;
    }
    aggregate.set(key, {
      product_id: line.product.id,
      variant_id: line.variant?.id ?? null,
      quantity: line.requestedQuantity,
    });
  }

  return Array.from(aggregate.values());
}

export async function reserveStockForOrder(
  supabase: SupabaseClient,
  orderId: string,
  resolvedItems: ResolvedCheckoutItem[]
) {
  const reservations = buildReservations(resolvedItems);
  const { data, error } = await supabase.rpc("reserve_order_inventory", {
    p_order_id: orderId,
    order_items: reservations as unknown as Json,
  });
  if (error) throw error;

  const result = (data ?? []) as { success: boolean; already_reserved: boolean; message: string }[];
  const failed = result.find((row) => !row.success);
  if (failed) {
    throw new Error(failed.message || "Inventory reservation failed");
  }
}

export async function restoreStockForOrder(
  supabase: SupabaseClient,
  orderId: string,
  resolvedItems: ResolvedCheckoutItem[]
) {
  const reservations = buildReservations(resolvedItems);
  const { data, error } = await supabase.rpc("restore_order_inventory", {
    p_order_id: orderId,
    order_items: reservations as unknown as Json,
  });
  if (error) throw error;

  const result = (data ?? []) as { success: boolean; was_reserved: boolean; message: string }[];
  const failed = result.find((row) => !row.success);
  if (failed) {
    throw new Error(failed.message || "Inventory restore failed");
  }
}
