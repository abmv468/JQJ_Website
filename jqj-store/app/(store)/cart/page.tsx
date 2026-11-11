"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useCurrency } from "@/context/CurrencyContext";
import CartCheckoutButton from "@/components/cart/CartCheckoutButton";
import CheckoutTrustStrip from "@/components/cart/CheckoutTrustStrip";
import LineItemThumbnail from "@/components/cart/LineItemThumbnail";
import QuantityStepper from "@/components/cart/QuantityStepper";
import StockCheckNotice from "@/components/cart/StockCheckNotice";
import { CART_SHIPPING_LINE } from "@/lib/cart-copy";

export default function CartPage() {
  const router = useRouter();
  const {
    items,
    updateQuantity,
    removeItem,
    subtotal,
    stockLoading,
    stockErrors,
    stockCheckFailed,
    retryStockCheck,
  } = useCart();
  const { formatFromUsd } = useCurrency();

  function goToCheckout() {
    if (stockLoading || stockErrors.length > 0) return;
    router.push("/checkout");
  }

  if (items.length === 0) {
    return (
      <div className="container-site flex flex-col items-center py-28 text-center">
        <h1 className="font-heading text-2xl uppercase tracking-wider2">Your cart is empty</h1>
        <p className="mt-3 text-sm text-brand-muted">Discover hand-crafted bracelets and necklaces.</p>
        <Link href="/new" className="btn-gold mt-8">
          Shop New Arrivals
        </Link>
      </div>
    );
  }

  return (
    <div className="container-site pb-44 pt-12 lg:pb-12">
      <h1 className="mb-10 font-heading text-2xl uppercase tracking-wider2">Cart</h1>
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_360px]">
        <ul className="divide-y divide-brand-border border-y border-brand-border">
          {items.map((item) => (
            <li
              key={`${item.id}-${item.sku ?? ""}-${item.size ?? ""}-${item.material ?? ""}`}
              className="flex gap-5 py-6"
            >
              <LineItemThumbnail src={item.image} alt={item.name} size={112} />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/products/${item.slug}`} className="pt-2.5 text-sm hover:text-brand-gold">
                    {item.name}
                  </Link>
                  <button
                    type="button"
                    aria-label={`Remove ${item.name}`}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-brand-muted hover:text-white"
                    onClick={() => removeItem(item.id, item.sku, item.size, item.material)}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                {item.size && <p className="mt-1 text-xs text-brand-muted">Size: {item.size}</p>}
                {item.material && <p className="mt-1 text-xs text-brand-muted">Material: {item.material}</p>}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <QuantityStepper
                    name={item.name}
                    quantity={item.quantity}
                    onDecrease={() =>
                      updateQuantity(item.id, item.sku, item.size, item.material, item.quantity - 1)
                    }
                    onIncrease={() =>
                      updateQuantity(item.id, item.sku, item.size, item.material, item.quantity + 1)
                    }
                  />
                  <span className="text-sm text-brand-gold">{formatFromUsd(item.price * item.quantity)}</span>
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
              <span>{formatFromUsd(subtotal)}</span>
            </div>
            <p className="text-brand-muted">{CART_SHIPPING_LINE}</p>
          </div>
          <div className="mt-6 flex justify-between border-t border-brand-border pt-4">
            <span className="font-heading uppercase tracking-wider2">Total</span>
            <span className="font-heading text-lg text-brand-gold">{formatFromUsd(subtotal)}</span>
          </div>
          {stockErrors.length > 0 && (
            <p className="mt-4 text-xs text-red-400" role="alert">
              {stockErrors[0]}
            </p>
          )}
          <div className="mt-6 hidden lg:block">
            <CartCheckoutButton
              busy={stockLoading}
              blocked={stockErrors.length > 0}
              onCheckout={goToCheckout}
            />
            <StockCheckNotice loading={stockLoading} failed={stockCheckFailed} onRetry={retryStockCheck} />
            <CheckoutTrustStrip />
          </div>
        </aside>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-brand-border bg-brand-surface/95 px-4 pt-3 shadow-[0_-18px_40px_rgba(0,0,0,0.35)] backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
        data-testid="cart-sticky-checkout"
      >
        <div className="flex items-center gap-3">
          <div className="min-w-[5.5rem]">
            <p className="font-heading text-[10px] uppercase tracking-wider2 text-brand-muted">Subtotal</p>
            <p className="font-heading text-lg leading-tight text-brand-gold">{formatFromUsd(subtotal)}</p>
          </div>
          <CartCheckoutButton
            busy={stockLoading}
            blocked={stockErrors.length > 0}
            className="flex-1"
            onCheckout={goToCheckout}
          />
        </div>
        <StockCheckNotice loading={stockLoading} failed={stockCheckFailed} onRetry={retryStockCheck} />
        {stockErrors.length > 0 && (
          <p className="mt-2 text-xs text-red-400" role="alert">
            {stockErrors[0]}
          </p>
        )}
        <CheckoutTrustStrip />
      </div>
    </div>
  );
}
