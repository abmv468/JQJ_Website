export const CART_STORAGE_KEY = "JQD-cart";
export const LEGACY_CART_STORAGE_KEY = "JQJ-cart";

export interface StoredCartItem {
  id: string;
  slug: string;
  name: string;
  price: number;
  image: string;
  sku?: string;
  size?: string;
  material?: string;
  quantity: number;
}

type CartStorage = {
  getItem: (key: string) => string | null;
};

export function parseStoredCart(raw: string | null): StoredCartItem[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as StoredCartItem[];
  } catch {
    return null;
  }
}

export function readStoredCart(storage: CartStorage): StoredCartItem[] {
  const currentRaw = storage.getItem(CART_STORAGE_KEY);
  if (currentRaw) {
    const parsed = parseStoredCart(currentRaw);
    if (parsed) return parsed;
  }
  const legacyRaw = storage.getItem(LEGACY_CART_STORAGE_KEY);
  if (legacyRaw) {
    const parsed = parseStoredCart(legacyRaw);
    if (parsed) return parsed;
  }
  return [];
}

/**
 * Do not write an empty cart over a saved one unless this session cleared it.
 * Inferred cause (not re-shot here): a remount can persist [] after hydration
 * flips true and before the load effect applies the just-saved line.
 * Returns null when the write must be skipped.
 */
export function cartPayloadToPersist(options: {
  items: StoredCartItem[];
  hydrated: boolean;
  emptyWriteAllowed: boolean;
  storedRaw: string | null;
}): string | null {
  if (!options.hydrated) return null;
  if (options.items.length === 0 && !options.emptyWriteAllowed) {
    const stored = parseStoredCart(options.storedRaw);
    if (stored && stored.length > 0) return null;
  }
  return JSON.stringify(options.items);
}

/** Hide the header badge only after hydration knows the cart is empty. */
export function isCartBadgeHidden(
  hydrated: boolean,
  itemCount: number,
): boolean {
  return hydrated && itemCount === 0;
}

/** The empty cart page waits until hydration. A saved line must not flash as empty. */
export function shouldShowEmptyCart(
  hydrated: boolean,
  itemCount: number,
): boolean {
  return hydrated && itemCount === 0;
}
