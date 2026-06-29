"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, CreditCard, Truck } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useCurrency } from "@/context/CurrencyContext";
import { createClient } from "@/lib/supabase/client";

const SHIPPING_FLAT = 15;
const COD_FEE = 20;

const countries = [
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
  "Hong Kong SAR",
  "Singapore",
  "Netherlands",
  "Germany",
];

export default function CheckoutPage() {
  const { items, subtotal, clearCart } = useCart();
  const { currency, formatFromUsd } = useCurrency();
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [method, setMethod] = useState<"stripe" | "cod">("stripe");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stockErrors, setStockErrors] = useState<string[]>([]);
  const [checkingStock, setCheckingStock] = useState(false);
  const [form, setForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    address: "",
    apartment: "",
    city: "",
    region: "",
    country: "United States",
    phone: "",
  });

  useEffect(() => {
    let isMounted = true;

    async function prefillFromAccount() {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!isMounted || !data.user) return;

      setSignedInEmail(data.user.email ?? null);

      const [profileRes, addressRes] = await Promise.all([
        supabase
          .from("customer_profiles")
          .select("first_name, last_name, phone")
          .eq("user_id", data.user.id)
          .maybeSingle(),
        supabase
          .from("customer_addresses")
          .select("first_name, last_name, address_line1, address_line2, city, region, country, phone")
          .eq("user_id", data.user.id)
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!isMounted) return;

      const profile = profileRes.data;
      const address = addressRes.data;
      setForm((prev) => ({
        ...prev,
        email: prev.email || data.user?.email || "",
        firstName: prev.firstName || profile?.first_name || address?.first_name || "",
        lastName: prev.lastName || profile?.last_name || address?.last_name || "",
        address: prev.address || address?.address_line1 || "",
        apartment: prev.apartment || address?.address_line2 || "",
        city: prev.city || address?.city || "",
        region: prev.region || address?.region || "",
        country: prev.country || address?.country || "United States",
        phone: prev.phone || profile?.phone || address?.phone || "",
      }));
    }

    void prefillFromAccount();
    return () => {
      isMounted = false;
    };
  }, []);

  const codFee = method === "cod" ? COD_FEE : 0;
  const shipping = items.length ? SHIPPING_FLAT : 0;
  const total = subtotal + shipping + codFee;
  const subtotalInCurrency = formatFromUsd(subtotal);
  const shippingInCurrency = formatFromUsd(shipping);
  const codFeeInCurrency = formatFromUsd(codFee);
  const totalInCurrency = formatFromUsd(total);

  const payloadItems = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        slug: item.slug,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        size: item.size,
        material: item.material,
        sku: item.sku,
      })),
    [items]
  );

  useEffect(() => {
    if (!payloadItems.length) return;
    setCheckingStock(true);
    fetch("/api/products/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: payloadItems }),
    })
      .then((response) => response.json())
      .then((data) => setStockErrors(data.errors ?? []))
      .catch(() => setStockErrors([]))
      .finally(() => setCheckingStock(false));
  }, [payloadItems]);

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.email || !form.firstName || !form.address || !form.city) {
      setError("Please complete the required fields.");
      return;
    }
    if (stockErrors.length > 0) {
      setError(stockErrors[0]);
      return;
    }

    setLoading(true);
    const idempotencyKey = crypto.randomUUID();
    const payload = {
      items: payloadItems,
      customer: form,
      shipping,
      currency,
      idempotencyKey,
    };

    try {
      const endpoint = method === "cod" ? "/api/checkout/cod" : "/api/checkout";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");

      if (method === "stripe") {
        window.location.href = data.url;
      } else {
        clearCart();
        window.location.href = `/order-confirmation?order_id=${data.orderId}&method=cod`;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="container-site flex flex-col items-center py-28 text-center">
        <h1 className="font-heading text-2xl uppercase tracking-wider2">Your cart is empty</h1>
        <Link href="/new" className="btn-gold mt-8">
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="container-site py-12">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
        {/* Form */}
        <form onSubmit={handleSubmit} className="order-2 lg:order-1">
          <div className="mb-8 flex flex-wrap items-center gap-4 border border-brand-border p-4 sm:gap-6 sm:p-5">
            <div className="flex items-center gap-2 text-xs text-brand-muted">
              <Truck className="h-4 w-4 text-brand-gold" /> UPS Express — Tracked delivery
            </div>
            <div className="flex items-center gap-2 text-xs text-brand-muted">
              <CreditCard className="h-4 w-4 text-brand-gold" /> Secure payment
            </div>
          </div>

          {/* Contact */}
          <section className="mb-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-sm uppercase tracking-wider2">Contact</h2>
              {signedInEmail ? (
                <Link href="/account" className="text-xs text-brand-gold underline">
                  Account
                </Link>
              ) : (
                <Link href="/auth/login" className="text-xs text-brand-gold underline">
                  Sign in
                </Link>
              )}
            </div>
            {signedInEmail && (
              <p className="mb-3 text-xs text-brand-muted">
                Signed in as <span className="text-white">{signedInEmail}</span>
              </p>
            )}
            <input
              type="email"
              required
              placeholder="Email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className="input-field"
            />
          </section>

          {/* Shipping address */}
          <section className="mb-8">
            <h2 className="mb-4 font-heading text-sm uppercase tracking-wider2">Shipping address</h2>
            <div className="space-y-3">
              <select
                value={form.country}
                onChange={(e) => update("country", e.target.value)}
                className="input-field"
              >
                {countries.map((c) => (
                  <option key={c} value={c} className="bg-brand-surface">
                    {c}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input required placeholder="First name" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} className="input-field" />
                <input placeholder="Last name" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} className="input-field" />
              </div>
              <input required placeholder="Address" value={form.address} onChange={(e) => update("address", e.target.value)} className="input-field" />
              <input placeholder="Apartment, suite, etc. (optional)" value={form.apartment} onChange={(e) => update("apartment", e.target.value)} className="input-field" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input required placeholder="City" value={form.city} onChange={(e) => update("city", e.target.value)} className="input-field" />
                <input placeholder="Region / State" value={form.region} onChange={(e) => update("region", e.target.value)} className="input-field" />
              </div>
              <input placeholder="Phone (optional)" value={form.phone} onChange={(e) => update("phone", e.target.value)} className="input-field" />
            </div>
          </section>

          {/* Payment method */}
          <section className="mb-8">
            <h2 className="mb-4 font-heading text-sm uppercase tracking-wider2">Payment</h2>
            <div className="space-y-3">
              <label className={`flex cursor-pointer items-center gap-3 border p-4 ${method === "stripe" ? "border-brand-gold" : "border-brand-border"}`}>
                <input type="radio" name="method" checked={method === "stripe"} onChange={() => setMethod("stripe")} className="accent-brand-gold" />
                <span className="text-sm">Credit / Debit Card (Stripe)</span>
              </label>
              <label className={`flex cursor-pointer items-center gap-3 border p-4 ${method === "cod" ? "border-brand-gold" : "border-brand-border"}`}>
                <input type="radio" name="method" checked={method === "cod"} onChange={() => setMethod("cod")} className="accent-brand-gold" />
                <span className="text-sm">Cash on Delivery (+{formatFromUsd(COD_FEE)} fee)</span>
              </label>
            </div>
          </section>

          {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
          {!error && stockErrors.length > 0 && (
            <p className="mb-4 text-sm text-red-400">{stockErrors[0]}</p>
          )}

          <div className="flex flex-col-reverse items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/cart" className="flex items-center gap-1 text-xs text-brand-muted hover:text-white">
              <ChevronLeft className="h-4 w-4" /> Return to cart
            </Link>
            <button
              type="submit"
              disabled={loading || checkingStock || stockErrors.length > 0}
              className="btn-gold disabled:opacity-60"
            >
              {loading ? "Processing…" : method === "cod" ? "Place Order" : "Continue to Payment"}
            </button>
          </div>
        </form>

        {/* Order summary */}
        <aside className="order-1 h-fit border border-brand-border p-6 lg:order-2">
          <ul className="space-y-4">
            {items.map((item) => (
              <li key={`${item.id}-${item.sku ?? ""}-${item.size ?? ""}-${item.material ?? ""}`} className="flex items-center gap-4">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden bg-brand-card">
                  <Image src={item.image} alt={item.name} fill sizes="64px" className="object-cover" />
                  <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand-gold text-[10px] font-semibold text-black">
                    {item.quantity}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-xs leading-snug">{item.name}</p>
                  {item.size && <p className="text-[11px] text-brand-muted">Size: {item.size}</p>}
                  {item.material && <p className="text-[11px] text-brand-muted">Material: {item.material}</p>}
                </div>
                <span className="text-sm">{formatFromUsd(item.price * item.quantity)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <input placeholder="Discount code or gift card" className="input-field" />
            <button type="button" className="btn-secondary px-5">Apply</button>
          </div>

          <div className="mt-6 space-y-3 border-t border-brand-border pt-6 text-sm">
            <div className="flex justify-between">
              <span className="text-brand-muted">Subtotal</span>
              <span>{subtotalInCurrency}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-brand-muted">Shipping</span>
              <span>{shippingInCurrency}</span>
            </div>
            {codFee > 0 && (
              <div className="flex justify-between">
                <span className="text-brand-muted">Cash on Delivery fee</span>
                <span>{codFeeInCurrency}</span>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-end justify-between border-t border-brand-border pt-4">
            <span className="font-heading uppercase tracking-wider2">Total</span>
            <span className="font-heading text-2xl text-brand-gold">{totalInCurrency}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
