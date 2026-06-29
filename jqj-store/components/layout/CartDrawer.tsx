"use client";

import Image from "next/image";
import Link from "next/link";
import { X, Minus, Plus } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useCurrency } from "@/context/CurrencyContext";

export default function CartDrawer() {
  const { formatFromUsd } = useCurrency();
  const {
    items,
    isOpen,
    setOpen,
    removeItem,
    updateQuantity,
    subtotal,
    itemCount,
  } = useCart();

  return (
    <div
      className={`fixed inset-0 z-50 ${isOpen ? "" : "pointer-events-none"}`}
      aria-hidden={!isOpen}
    >
      <div
        className={`absolute inset-0 bg-black/70 transition-opacity ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={() => setOpen(false)}
      />
      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-brand-surface shadow-xl transition-transform ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-brand-border p-5">
          <h2 className="font-heading text-sm uppercase tracking-wider2">
            Cart ({itemCount})
          </h2>
          <button type="button" aria-label="Close cart" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {items.length === 0 ? (
            <p className="mt-10 text-center text-sm text-brand-muted">
              Your cart is empty.
            </p>
          ) : (
            <ul className="space-y-5">
              {items.map((item) => (
                <li key={`${item.id}-${item.sku ?? ""}-${item.size ?? ""}-${item.material ?? ""}`} className="flex gap-4">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-brand bg-brand-card">
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  </div>
                  <div className="flex flex-1 flex-col">
                    <div className="flex justify-between gap-2">
                      <p className="text-sm leading-snug">{item.name}</p>
                      <button
                        type="button"
                        aria-label="Remove"
                        onClick={() => removeItem(item.id, item.sku, item.size, item.material)}
                      >
                        <X className="h-4 w-4 text-brand-muted hover:text-white" />
                      </button>
                    </div>
                    {item.size && (
                      <p className="text-xs text-brand-muted">Size: {item.size}</p>
                    )}
                    {item.material && (
                      <p className="text-xs text-brand-muted">Material: {item.material}</p>
                    )}
                    <div className="mt-auto flex items-center justify-between">
                      <div className="flex items-center border border-brand-border">
                        <button
                          type="button"
                          aria-label="Decrease"
                          className="px-2 py-1"
                          onClick={() =>
                            updateQuantity(item.id, item.sku, item.size, item.material, item.quantity - 1)
                          }
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-8 text-center text-xs">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label="Increase"
                          className="px-2 py-1"
                          onClick={() =>
                            updateQuantity(item.id, item.sku, item.size, item.material, item.quantity + 1)
                          }
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-sm text-brand-gold">
                        {formatFromUsd(item.price * item.quantity)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-brand-border p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm text-brand-muted">Subtotal</span>
              <span className="font-heading text-lg text-white">
                {formatFromUsd(subtotal)}
              </span>
            </div>
            <Link
              href="/checkout"
              className="btn-gold w-full"
              onClick={() => setOpen(false)}
            >
              Checkout
            </Link>
            <button
              type="button"
              className="mt-2 w-full text-center text-xs uppercase tracking-wider2 text-brand-muted hover:text-white"
              onClick={() => setOpen(false)}
            >
              Continue Shopping
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
