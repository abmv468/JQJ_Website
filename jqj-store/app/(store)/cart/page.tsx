"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, X } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/lib/utils";

export default function CartPage() {
  const { items, updateQuantity, removeItem, subtotal } = useCart();

  if (items.length === 0) {
    return (
      <div className="container-site flex flex-col items-center py-28 text-center">
        <h1 className="font-heading text-2xl uppercase tracking-wider2">Your cart is empty</h1>
        <p className="mt-3 text-sm text-brand-muted">
          Discover hand-crafted bracelets and necklaces.
        </p>
        <Link href="/new" className="btn-gold mt-8">
          Shop New Arrivals
        </Link>
      </div>
    );
  }

  return (
    <div className="container-site py-12">
      <h1 className="mb-10 font-heading text-2xl uppercase tracking-wider2">Cart</h1>
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_360px]">
        <ul className="divide-y divide-brand-border border-y border-brand-border">
          {items.map((item) => (
            <li key={`${item.id}-${item.size ?? ""}`} className="flex gap-5 py-6">
              <div className="relative h-28 w-28 shrink-0 overflow-hidden bg-brand-card">
                <Image src={item.image} alt={item.name} fill sizes="112px" className="object-cover" />
              </div>
              <div className="flex flex-1 flex-col">
                <div className="flex items-start justify-between">
                  <Link href={`/products/${item.slug}`} className="text-sm hover:text-brand-gold">
                    {item.name}
                  </Link>
                  <button type="button" aria-label="Remove" onClick={() => removeItem(item.id, item.size)}>
                    <X className="h-4 w-4 text-brand-muted hover:text-white" />
                  </button>
                </div>
                {item.size && <p className="mt-1 text-xs text-brand-muted">Size: {item.size}</p>}
                <div className="mt-auto flex items-center justify-between">
                  <div className="flex items-center border border-brand-border">
                    <button type="button" aria-label="Decrease" className="px-3 py-2" onClick={() => updateQuantity(item.id, item.size, item.quantity - 1)}>
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-10 text-center text-sm">{item.quantity}</span>
                    <button type="button" aria-label="Increase" className="px-3 py-2" onClick={() => updateQuantity(item.id, item.size, item.quantity + 1)}>
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <span className="text-sm text-brand-gold">{formatPrice(item.price * item.quantity)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="h-fit border border-brand-border p-6">
          <h2 className="font-heading text-sm uppercase tracking-wider2">Order Summary</h2>
          <div className="mt-6 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-brand-muted">Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-brand-muted">Shipping</span>
              <span className="text-brand-muted">Calculated at checkout</span>
            </div>
          </div>
          <div className="mt-6 flex justify-between border-t border-brand-border pt-4">
            <span className="font-heading uppercase tracking-wider2">Total</span>
            <span className="font-heading text-lg text-brand-gold">{formatPrice(subtotal)}</span>
          </div>
          <Link href="/checkout" className="btn-gold mt-6 w-full">
            Checkout
          </Link>
        </aside>
      </div>
    </div>
  );
}
