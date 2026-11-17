"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CART_STORAGE_KEY,
  LEGACY_CART_STORAGE_KEY,
  cartPayloadToPersist,
  readStoredCart,
  type StoredCartItem,
} from "@/lib/cart-storage";

export type CartItem = StoredCartItem;

interface CartContextValue {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  removeItem: (
    id: string,
    sku?: string,
    size?: string,
    material?: string,
  ) => void;
  updateQuantity: (
    id: string,
    sku: string | undefined,
    size: string | undefined,
    material: string | undefined,
    quantity: number,
  ) => void;
  clearCart: () => void;
  itemCount: number;
  subtotal: number;
  hydrated: boolean;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

function lineKey(id: string, sku?: string, size?: string, material?: string) {
  return `${id}__${sku ?? ""}__${size ?? ""}__${material ?? ""}`;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // An empty persist is allowed only after the shopper changes the cart.
  // Inferred: a remount otherwise writes [] over a line saved a moment earlier.
  const emptyWriteAllowed = useRef(false);

  // Load persisted cart after mount to avoid hydration mismatch.
  useEffect(() => {
    try {
      const loaded = readStoredCart(localStorage);
      if (loaded.length > 0) setItems(loaded);
      const current = localStorage.getItem(CART_STORAGE_KEY);
      const legacy = localStorage.getItem(LEGACY_CART_STORAGE_KEY);
      if (!current && legacy) {
        localStorage.setItem(CART_STORAGE_KEY, legacy);
      }
    } catch {
      // ignore malformed storage
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const payload = cartPayloadToPersist({
        items,
        hydrated,
        emptyWriteAllowed: emptyWriteAllowed.current,
        storedRaw: localStorage.getItem(CART_STORAGE_KEY),
      });
      if (payload === null) return;
      localStorage.setItem(CART_STORAGE_KEY, payload);
      localStorage.removeItem(LEGACY_CART_STORAGE_KEY);
    } catch {
      // ignore storage failures
    }
  }, [items, hydrated]);

  function addItem(item: Omit<CartItem, "quantity">, quantity = 1) {
    emptyWriteAllowed.current = true;
    setItems((prev) => {
      const key = lineKey(item.id, item.sku, item.size, item.material);
      const existing = prev.find(
        (p) => lineKey(p.id, p.sku, p.size, p.material) === key,
      );
      if (existing) {
        return prev.map((p) =>
          lineKey(p.id, p.sku, p.size, p.material) === key
            ? { ...p, quantity: p.quantity + quantity }
            : p,
        );
      }
      return [...prev, { ...item, quantity }];
    });
    setOpen(true);
  }

  function removeItem(
    id: string,
    sku?: string,
    size?: string,
    material?: string,
  ) {
    emptyWriteAllowed.current = true;
    const key = lineKey(id, sku, size, material);
    setItems((prev) =>
      prev.filter((p) => lineKey(p.id, p.sku, p.size, p.material) !== key),
    );
  }

  function updateQuantity(
    id: string,
    sku: string | undefined,
    size: string | undefined,
    material: string | undefined,
    quantity: number,
  ) {
    emptyWriteAllowed.current = true;
    const key = lineKey(id, sku, size, material);
    setItems((prev) =>
      prev
        .map((p) =>
          lineKey(p.id, p.sku, p.size, p.material) === key
            ? { ...p, quantity: Math.max(0, quantity) }
            : p,
        )
        .filter((p) => p.quantity > 0),
    );
  }

  function clearCart() {
    emptyWriteAllowed.current = true;
    setItems([]);
  }

  const itemCount = useMemo(
    () => items.reduce((n, i) => n + i.quantity, 0),
    [items],
  );
  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [items],
  );

  const value: CartContextValue = {
    items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    itemCount,
    subtotal,
    hydrated,
    isOpen,
    setOpen,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
