"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, CreditCard, Truck } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useCurrency } from "@/context/CurrencyContext";
import { buildCheckoutSummary, formatCheckoutCharge } from "@/lib/checkout-currency";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/utils";

const SHIPPING_FLAT = 15;
const COD_FEE = 20;
const AIRWALLEX_SDK_SRC = "https://static.airwallex.com/components/sdk/v1/index.js";

declare global {
  interface Window {
    AirwallexComponentsSDK?: {
      init: (config: {
        env: "demo" | "prod";
        enabledElements: string[];
      }) => Promise<{
        payments: {
          redirectToCheckout: (props: {
            intent_id: string;
            client_secret: string;
            currency: string;
            successUrl: string;
            failUrl?: string;
            cancelUrl?: string;
            country_code?: string;
          }) => Promise<void> | void;
        };
      }>;
    };
  }
}

async function loadAirwallexSdk() {
  if (window.AirwallexComponentsSDK) {
    return window.AirwallexComponentsSDK;
  }

  const existing = document.querySelector<HTMLScriptElement>(
    'script[data-airwallex-sdk="true"]'
  );
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      if (window.AirwallexComponentsSDK) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load Airwallex checkout SDK")),
        { once: true }
      );
    });
    if (window.AirwallexComponentsSDK) return window.AirwallexComponentsSDK;
    throw new Error("Airwallex SDK is unavailable");
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = AIRWALLEX_SDK_SRC;
    script.async = true;
    script.setAttribute("data-airwallex-sdk", "true");
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Airwallex checkout SDK"));
    document.head.appendChild(script);
  });

  if (!window.AirwallexComponentsSDK) {
    throw new Error("Airwallex SDK failed to initialize");
  }
  return window.AirwallexComponentsSDK;
}

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
  const { items, clearCart } = useCart();
  const { currency } = useCurrency();
  const checkoutAttemptIdRef = useRef<string>(crypto.randomUUID());
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [method, setMethod] = useState<"airwallex" | "cod">("airwallex");
  const [loading, setLoading] = useState(false);
  const [paymentStage, setPaymentStage] = useState<
    "idle" | "creating_payment" | "redirecting_to_airwallex"
  >("idle");
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
  const summary = buildCheckoutSummary({
    items: items.map((item) => ({
      name: item.name,
      unitPriceUsd: item.price,
      quantity: item.quantity,
    })),
    shippingUsd: shipping,
    codFeeUsd: codFee,
    displayCurrency: currency,
  });
  const codFeeInCurrency =
    method === "cod" ? formatCheckoutCharge(COD_FEE) : formatPrice(codFee, { currency: "USD" });

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
    setPaymentStage(method === "airwallex" ? "creating_payment" : "idle");

    const idempotencyKey = checkoutAttemptIdRef.current;
    const payload = {
      items: payloadItems,
      customer: form,
      shipping,
      currency: method === "airwallex" ? "USD" : currency,
      idempotencyKey,
    };

    try {
      const endpoint = method === "cod" ? "/api/checkout/cod" : "/api/checkout/airwallex";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");

      if (method === "airwallex") {
        if (!data.intentId || !data.clientSecret || !data.orderId || !data.currency || !data.sdkEnv) {
          throw new Error("Airwallex checkout payload is incomplete");
        }

        setPaymentStage("redirecting_to_airwallex");

        const sdk = await loadAirwallexSdk();
        const { payments } = await sdk.init({
          env: data.sdkEnv,
          enabledElements: ["payments"],
        });
        const successUrl = `${window.location.origin}/order-confirmation?provider=airwallex&order_id=${encodeURIComponent(
          data.orderId
        )}`;
        const failUrl = `${window.location.origin}/order-confirmation?provider=airwallex&order_id=${encodeURIComponent(
          data.orderId
        )}&state=failed`;

        await payments.redirectToCheckout({
          intent_id: data.intentId,
          client_secret: data.clientSecret,
          currency: data.currency,
          successUrl,
          failUrl,
          country_code: data.countryCode,
        });
        setLoading(false);
        setPaymentStage("idle");
      } else {
        clearCart();
        window.location.href = `/order-confirmation?order_id=${data.orderId}&method=cod`;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
      setPaymentStage("idle");
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
              <label className={`flex cursor-pointer items-center gap-3 border p-4 ${method === "airwallex" ? "border-brand-gold" : "border-brand-border"}`}>
                <input type="radio" name="method" checked={method === "airwallex"} onChange={() => setMethod("airwallex")} className="accent-brand-gold" />
                <span className="text-sm">Credit / Debit Card (Airwallex Hosted Checkout)</span>
              </label>
              <label className={`flex cursor-pointer items-center gap-3 border p-4 ${method === "cod" ? "border-brand-gold" : "border-brand-border"}`}>
                <input type="radio" name="method" checked={method === "cod"} onChange={() => setMethod("cod")} className="accent-brand-gold" />
                <span className="text-sm">Cash on Delivery (+{codFeeInCurrency} fee)</span>
              </label>
            </div>
            {method === "airwallex" && (
              <p className="mt-3 text-xs text-brand-muted">
                Airwallex sandbox checkout currently charges in USD only.
              </p>
            )}
          </section>

          {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
          {!error && stockErrors.length > 0 && (
            <p className="mb-4 text-sm text-red-400">{stockErrors[0]}</p>
          )}
          {!error && paymentStage === "creating_payment" && (
            <p className="mb-4 text-sm text-brand-muted">Creating secure payment session…</p>
          )}
          {!error && paymentStage === "redirecting_to_airwallex" && (
            <p className="mb-4 text-sm text-brand-muted">Redirecting to Airwallex secure checkout…</p>
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
              {loading ? "Processing…" : method === "cod" ? "Place Order" : "Continue to Secure Payment"}
            </button>
          </div>
        </form>

        {/* Order summary */}
        <aside className="order-1 h-fit border border-brand-border p-6 lg:order-2">
          <ul className="space-y-4">
            {items.map((item, index) => (
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
                <span className="text-sm">{summary.lines[index]?.formatted}</span>
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
              <span>{summary.subtotal}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-brand-muted">Shipping</span>
              <span>{summary.shipping}</span>
            </div>
            {summary.codFeeUsd > 0 && (
              <div className="flex justify-between">
                <span className="text-brand-muted">Cash on Delivery fee</span>
                <span>{summary.codFee}</span>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-end justify-between border-t border-brand-border pt-4">
            <span className="font-heading uppercase tracking-wider2">Total</span>
            <span className="flex items-baseline gap-3">
              {summary.chargeNote ? (
                <span className="text-xs font-body normal-case tracking-normal text-brand-muted">
                  {summary.chargeNote}
                </span>
              ) : null}
              <span className="font-heading text-2xl text-brand-gold">{summary.total}</span>
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
