"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface CartItem {
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

interface CartContextValue {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  removeItem: (id: string, sku?: string, size?: string, material?: string) => void;
  updateQuantity: (
    id: string,
    sku: string | undefined,
    size: string | undefined,
    material: string | undefined,
    quantity: number
  ) => void;
  clearCart: () => void;
  itemCount: number;
  subtotal: number;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

const STORAGE_KEY = "JQD-cart";
const LEGACY_STORAGE_KEY = "JQJ-cart";

function lineKey(id: string, sku?: string, size?: string, material?: string) {
  return `${id}__${sku ?? ""}__${size ?? ""}__${material ?? ""}`;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Load persisted cart after mount to avoid hydration mismatch.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw) {
        try {
          setItems(JSON.parse(raw));
        } catch {
          localStorage.removeItem(STORAGE_KEY);
          if (legacyRaw) {
            setItems(JSON.parse(legacyRaw));
            localStorage.setItem(STORAGE_KEY, legacyRaw);
          }
        }
      } else if (legacyRaw) {
        setItems(JSON.parse(legacyRaw));
        localStorage.setItem(STORAGE_KEY, legacyRaw);
      }
    } catch {
      // ignore malformed storage
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }, [items, hydrated]);

  function addItem(item: Omit<CartItem, "quantity">, quantity = 1) {
    setItems((prev) => {
      const key = lineKey(item.id, item.sku, item.size, item.material);
      const existing = prev.find((p) => lineKey(p.id, p.sku, p.size, p.material) === key);
      if (existing) {
        return prev.map((p) =>
          lineKey(p.id, p.sku, p.size, p.material) === key
            ? { ...p, quantity: p.quantity + quantity }
            : p
        );
      }
      return [...prev, { ...item, quantity }];
    });
    setOpen(true);
  }

  function removeItem(id: string, sku?: string, size?: string, material?: string) {
    const key = lineKey(id, sku, size, material);
    setItems((prev) => prev.filter((p) => lineKey(p.id, p.sku, p.size, p.material) !== key));
  }

  function updateQuantity(
    id: string,
    sku: string | undefined,
    size: string | undefined,
    material: string | undefined,
    quantity: number
  ) {
    const key = lineKey(id, sku, size, material);
    setItems((prev) =>
      prev
        .map((p) =>
          lineKey(p.id, p.sku, p.size, p.material) === key
            ? { ...p, quantity: Math.max(0, quantity) }
            : p
        )
        .filter((p) => p.quantity > 0)
    );
  }

  function clearCart() {
    setItems([]);
  }

  const itemCount = useMemo(
    () => items.reduce((n, i) => n + i.quantity, 0),
    [items]
  );
  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [items]
  );

  const value: CartContextValue = {
    items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    itemCount,
    subtotal,
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
