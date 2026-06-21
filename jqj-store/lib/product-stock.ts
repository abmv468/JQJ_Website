export interface SellableVariant {
  id?: string;
  size?: string | null;
  material?: string | null;
  sku: string;
  stockCount: number;
}

export interface StockShape {
  stockCount?: number | null;
  inStock?: boolean | null;
  lowStockThreshold?: number | null;
  variants?: SellableVariant[] | null;
}

export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export function normalizeStockCount(value?: number | null) {
  return Math.max(0, Number(value ?? 0));
}

export function getLowStockThreshold(value?: number | null) {
  return Math.max(1, Number(value ?? DEFAULT_LOW_STOCK_THRESHOLD));
}

export function getStockState(shape: StockShape) {
  const variants = shape.variants?.length ? shape.variants : undefined;
  const lowStockThreshold = getLowStockThreshold(shape.lowStockThreshold);

  if (variants) {
    const availableStock = variants.reduce(
      (sum, variant) => sum + normalizeStockCount(variant.stockCount),
      0
    );
    const inStock = availableStock > 0;
    return {
      hasVariants: true,
      inStock,
      availableStock,
      isLowStock: inStock && availableStock <= lowStockThreshold,
      lowStockThreshold,
    };
  }

  const availableStock = normalizeStockCount(shape.stockCount);
  const inStock = shape.inStock ?? availableStock > 0;
  return {
    hasVariants: false,
    inStock,
    availableStock,
    isLowStock: inStock && availableStock <= lowStockThreshold,
    lowStockThreshold,
  };
}

export function getVariantLabel(variant: Pick<SellableVariant, "size" | "material" | "sku">) {
  const parts = [variant.size, variant.material].filter(Boolean);
  return parts.length ? parts.join(" / ") : variant.sku;
}
