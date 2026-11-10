"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useCurrency } from "@/context/CurrencyContext";
import CheckoutTrustStrip from "@/components/cart/CheckoutTrustStrip";
import LineItemThumbnail from "@/components/cart/LineItemThumbnail";
import QuantityStepper from "@/components/cart/QuantityStepper";
import { CART_SHIPPING_LINE } from "@/lib/cart-copy";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.hasAttribute("disabled") || el.getAttribute("aria-hidden") === "true") return false;
    return el.tabIndex >= 0;
  });
}

export default function CartDrawer() {
  const { formatFromUsd } = useCurrency();
  const { items, isOpen, setOpen, removeItem, updateQuantity, subtotal, itemCount } = useCart();
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const panel = panelRef.current;
    if (!root || !panel) return;

    if (!isOpen) {
      root.setAttribute("inert", "");
      return;
    }

    root.removeAttribute("inert");
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.focus({ preventScroll: true });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const itemsInPanel = focusableIn(panel);
      if (itemsInPanel.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = itemsInPanel[0];
      const last = itemsInPanel[itemsInPanel.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && panel.contains(active);

      if (event.shiftKey && (!inside || active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      root.setAttribute("inert", "");
      opener?.focus({ preventScroll: true });
    };
  }, [isOpen, setOpen]);

  function close() {
    setOpen(false);
  }

  return (
    <div
      ref={rootRef}
      className={`fixed inset-0 z-50 ${isOpen ? "" : "pointer-events-none"}`}
      aria-hidden={!isOpen}
    >
      <div
        className={`absolute inset-0 bg-black/70 transition-opacity motion-reduce:transition-none ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={close}
      />
      <aside
        ref={panelRef}
        role={isOpen ? "dialog" : undefined}
        aria-modal={isOpen ? true : undefined}
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-brand-surface shadow-xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none focus:outline-none ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-brand-border px-5 py-4">
          <h2 id={titleId} className="font-heading text-sm uppercase tracking-wider2">
            Cart ({itemCount})
          </h2>
          <button
            type="button"
            aria-label="Close cart"
            className="inline-flex h-11 w-11 items-center justify-center text-white/80 hover:text-white"
            onClick={close}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {items.length === 0 ? (
            <p className="mt-10 text-center text-sm text-brand-muted">Your cart is empty.</p>
          ) : (
            <ul className="space-y-5">
              {items.map((item) => (
                <li
                  key={`${item.id}-${item.sku ?? ""}-${item.size ?? ""}-${item.material ?? ""}`}
                  className="flex gap-4"
                >
                  <LineItemThumbnail src={item.image} alt={item.name} size={80} rounded />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <p className="pt-2.5 text-sm leading-snug">{item.name}</p>
                      <button
                        type="button"
                        aria-label={`Remove ${item.name}`}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-brand-muted hover:text-white"
                        onClick={() => removeItem(item.id, item.sku, item.size, item.material)}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    {item.size && <p className="text-xs text-brand-muted">Size: {item.size}</p>}
                    {item.material && <p className="text-xs text-brand-muted">Material: {item.material}</p>}
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <QuantityStepper
                        name={item.name}
                        quantity={item.quantity}
                        onDecrease={() =>
                          updateQuantity(
                            item.id,
                            item.sku,
                            item.size,
                            item.material,
                            item.quantity - 1
                          )
                        }
                        onIncrease={() =>
                          updateQuantity(
                            item.id,
                            item.sku,
                            item.size,
                            item.material,
                            item.quantity + 1
                          )
                        }
                      />
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
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-brand-muted">Subtotal</span>
              <span className="font-heading text-lg text-white">{formatFromUsd(subtotal)}</span>
            </div>
            <p className="mb-4 text-sm text-brand-muted">{CART_SHIPPING_LINE}</p>
            <Link href="/checkout" className="btn-gold min-h-11 w-full" onClick={close}>
              Checkout
            </Link>
            <CheckoutTrustStrip />
            <button
              type="button"
              className="mt-2 inline-flex min-h-11 w-full items-center justify-center text-center text-xs uppercase tracking-wider2 text-brand-muted hover:text-white"
              onClick={close}
            >
              Continue Shopping
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
