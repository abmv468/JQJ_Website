import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CART_STORAGE_KEY,
  LEGACY_CART_STORAGE_KEY,
  cartPayloadToPersist,
  isCartBadgeHidden,
  persistClearedCart,
  readStoredCart,
  shouldShowEmptyCart,
  type StoredCartItem,
} from "@/lib/cart-storage";

const line: StoredCartItem = {
  id: "blue-lace-agate-pendant",
  slug: "blue-lace-agate-silver-pendant",
  name: "Blue Lace Agate Silver Pendant",
  price: 249.99,
  image: "/products/blue-lace-agate-pendant.webp",
  sku: "JQJ-BLAPEN-45-SS",
  size: "45cm",
  material: "Sterling Silver",
  quantity: 1,
};

function memoryStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

/** The confirmation load effect: read the saved cart, then copy a legacy key. */
function confirmationHydratedLines(storage: ReturnType<typeof memoryStorage>) {
  const loaded = readStoredCart(storage);
  const current = storage.getItem(CART_STORAGE_KEY);
  const legacy = storage.getItem(LEGACY_CART_STORAGE_KEY);
  if (!current && legacy) {
    storage.setItem(CART_STORAGE_KEY, legacy);
  }
  return loaded;
}

describe("cart hydration regression", () => {
  it("keeps an added line when a remount would persist an empty cart", () => {
    const storage = memoryStorage();
    const saved = cartPayloadToPersist({
      items: [line],
      hydrated: true,
      emptyWriteAllowed: true,
      storedRaw: null,
    });
    expect(saved).toBe(JSON.stringify([line]));
    storage.setItem(CART_STORAGE_KEY, saved!);

    const beforeLoad = cartPayloadToPersist({
      items: [],
      hydrated: false,
      emptyWriteAllowed: false,
      storedRaw: storage.getItem(CART_STORAGE_KEY),
    });
    expect(beforeLoad).toBeNull();

    // Inferred race: hydrated flips true before the saved line is in memory.
    const raced = cartPayloadToPersist({
      items: [],
      hydrated: true,
      emptyWriteAllowed: false,
      storedRaw: storage.getItem(CART_STORAGE_KEY),
    });
    expect(raced).toBeNull();
    expect(storage.getItem(CART_STORAGE_KEY)).toBe(JSON.stringify([line]));

    const restored = readStoredCart(storage);
    expect(restored).toEqual([line]);
    expect(shouldShowEmptyCart(true, restored.length)).toBe(false);
    expect(
      isCartBadgeHidden(
        true,
        restored.reduce((sum, item) => sum + item.quantity, 0),
      ),
    ).toBe(false);
  });

  it("does not show an empty cart or hide the badge before hydration", () => {
    expect(shouldShowEmptyCart(false, 0)).toBe(false);
    expect(isCartBadgeHidden(false, 0)).toBe(false);
    expect(shouldShowEmptyCart(true, 0)).toBe(true);
    expect(isCartBadgeHidden(true, 0)).toBe(true);
  });

  it("reads the legacy key and still allows an intentional clear", () => {
    const storage = memoryStorage({
      [LEGACY_CART_STORAGE_KEY]: JSON.stringify([line]),
    });
    expect(readStoredCart(storage)).toEqual([line]);

    const cleared = cartPayloadToPersist({
      items: [],
      hydrated: true,
      emptyWriteAllowed: true,
      storedRaw: JSON.stringify([line]),
    });
    expect(cleared).toBe("[]");
  });

  it("commits a clear before unload so confirmation hydrates no leftover line", () => {
    const storage = memoryStorage({
      [CART_STORAGE_KEY]: JSON.stringify([line]),
      [LEGACY_CART_STORAGE_KEY]: JSON.stringify([line]),
    });

    persistClearedCart(storage);

    expect(confirmationHydratedLines(storage)).toEqual([]);
    expect(storage.getItem(CART_STORAGE_KEY)).toBe("[]");
    expect(storage.getItem(LEGACY_CART_STORAGE_KEY)).toBeNull();
    expect(shouldShowEmptyCart(true, 0)).toBe(true);
    expect(isCartBadgeHidden(true, 0)).toBe(true);
  });

  it("clearCart writes that empty cart before it returns", () => {
    const source = readFileSync(
      path.join(process.cwd(), "context/CartContext.tsx"),
      "utf8",
    );
    const fn = source.match(/function clearCart\(\) \{[\s\S]*?\n  \}/);
    expect(fn?.[0]).toContain("persistClearedCart(localStorage)");
    expect(fn?.[0]).not.toContain("useEffect");
  });
});
