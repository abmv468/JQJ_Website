"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, CreditCard, Loader2, Truck } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useCurrency } from "@/context/CurrencyContext";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/utils";
import { CheckoutCountryField, CheckoutTextField } from "./checkout-fields";
import {
  CHECKOUT_ERROR_FIELDS,
  CHECKOUT_FIELD_FOCUS_ORDER,
  CHECKOUT_SHIPPING_LABEL,
  CHECKOUT_STATUS_PROCESSING,
  CHECKOUT_STATUS_REDIRECTING,
  customerSafeCheckoutMessage,
  readCheckoutFailure,
  validateCheckoutCustomer,
  type CheckoutCustomer,
  type CheckoutCustomerField,
  type CheckoutFieldErrors,
} from "@/lib/checkout-messages";

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

const emptyCustomer = (): CheckoutCustomer => ({
  email: "",
  firstName: "",
  lastName: "",
  address: "",
  apartment: "",
  city: "",
  region: "",
  country: "United States",
  phone: "",
  postcode: "",
});

type CheckoutResponse = {
  error?: unknown;
  errors?: unknown;
  orderId?: string;
  intentId?: string;
  clientSecret?: string;
  currency?: string;
  sdkEnv?: "demo" | "prod";
  countryCode?: string;
};

async function readCheckoutResponse(response: Response): Promise<CheckoutResponse> {
  try {
    return (await response.json()) as CheckoutResponse;
  } catch {
    return {};
  }
}

export default function CheckoutPage() {
  const { items, subtotal, clearCart } = useCart();
  const { currency, formatFromUsd } = useCurrency();
  const checkoutAttemptIdRef = useRef<string>(crypto.randomUUID());
  const submittingRef = useRef(false);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [method, setMethod] = useState<"airwallex" | "cod">("airwallex");
  const [loading, setLoading] = useState(false);
  const [paymentStage, setPaymentStage] = useState<
    "idle" | "creating_payment" | "redirecting_to_airwallex"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<CheckoutFieldErrors>({});
  const [stockErrors, setStockErrors] = useState<string[]>([]);
  const [checkingStock, setCheckingStock] = useState(false);
  const [form, setForm] = useState<CheckoutCustomer>(emptyCustomer);

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
          .select("first_name, last_name, address_line1, address_line2, city, region, country, phone, postal_code")
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
        postcode: prev.postcode || address?.postal_code || "",
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
  const chargeCurrency = method === "airwallex" ? "USD" : currency;
  const formatCheckoutAmount = (amountUsd: number) =>
    chargeCurrency === "USD" ? formatPrice(amountUsd, { currency: "USD" }) : formatFromUsd(amountUsd);
  const subtotalInCurrency = formatCheckoutAmount(subtotal);
  const shippingInCurrency = formatCheckoutAmount(shipping);
  const codFeeInCurrency = formatCheckoutAmount(codFee);
  const totalInCurrency = formatCheckoutAmount(total);

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

  function update(field: CheckoutCustomerField, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;

    const clientErrors = validateCheckoutCustomer(form);
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setError(CHECKOUT_ERROR_FIELDS);
      const firstInvalid = CHECKOUT_FIELD_FOCUS_ORDER.find((key) => clientErrors[key]);
      if (firstInvalid) document.getElementById(`checkout-${firstInvalid}`)?.focus();
      return;
    }
    if (stockErrors.length > 0) {
      setFieldErrors({});
      setError(stockErrors[0]);
      return;
    }

    submittingRef.current = true;
    setFieldErrors({});
    setError(null);
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

    let holdSubmitLock = false;

    try {
      const endpoint = method === "cod" ? "/api/checkout/cod" : "/api/checkout/airwallex";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readCheckoutResponse(res);
      if (!res.ok) {
        console.error("Checkout request failed", data);
        const failure = readCheckoutFailure(data);
        setFieldErrors(failure.fields);
        setError(failure.formMessage);
        return;
      }

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
      } else {
        holdSubmitLock = true;
        clearCart();
        window.location.href = `/order-confirmation?order_id=${data.orderId}&method=cod`;
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Something went wrong";
      console.error(raw);
      setError(customerSafeCheckoutMessage(raw));
    } finally {
      if (!holdSubmitLock) {
        submittingRef.current = false;
        setLoading(false);
        setPaymentStage("idle");
      }
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

  const statusMessage =
    paymentStage === "redirecting_to_airwallex"
      ? CHECKOUT_STATUS_REDIRECTING
      : loading
        ? CHECKOUT_STATUS_PROCESSING
        : null;
  const alertMessage = error ?? (stockErrors.length > 0 ? stockErrors[0] : null);

  return (
    <div className="container-site py-12">
      <h1 className="mb-8 font-heading text-2xl uppercase tracking-wider2">Checkout</h1>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="order-2 lg:order-1">
          <div className="mb-8 flex flex-wrap items-center gap-4 border border-brand-border p-4 sm:gap-6 sm:p-5">
            <div className="flex items-center gap-2 text-xs text-brand-muted">
              <Truck className="h-4 w-4 text-brand-gold" /> {CHECKOUT_SHIPPING_LABEL}
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
            <CheckoutTextField
              id="checkout-email"
              name="email"
              label="Email"
              type="email"
              required
              value={form.email}
              error={fieldErrors.email}
              onChange={(value) => update("email", value)}
            />
          </section>

          {/* Shipping address */}
          <section className="mb-8">
            <h2 className="mb-4 font-heading text-sm uppercase tracking-wider2">Shipping address</h2>
            <div className="space-y-3">
              <CheckoutCountryField
                id="checkout-country"
                value={form.country}
                error={fieldErrors.country}
                countries={countries}
                onChange={(value) => update("country", value)}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <CheckoutTextField
                  id="checkout-firstName"
                  name="firstName"
                  label="First name"
                  required
                  value={form.firstName}
                  error={fieldErrors.firstName}
                  onChange={(value) => update("firstName", value)}
                />
                <CheckoutTextField
                  id="checkout-lastName"
                  name="lastName"
                  label="Last name"
                  value={form.lastName}
                  error={fieldErrors.lastName}
                  onChange={(value) => update("lastName", value)}
                />
              </div>
              <CheckoutTextField
                id="checkout-address"
                name="address"
                label="Address"
                required
                value={form.address}
                error={fieldErrors.address}
                onChange={(value) => update("address", value)}
              />
              <CheckoutTextField
                id="checkout-apartment"
                name="apartment"
                label="Apartment, suite, etc. (optional)"
                value={form.apartment}
                error={fieldErrors.apartment}
                onChange={(value) => update("apartment", value)}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <CheckoutTextField
                  id="checkout-city"
                  name="city"
                  label="City"
                  required
                  value={form.city}
                  error={fieldErrors.city}
                  onChange={(value) => update("city", value)}
                />
                <CheckoutTextField
                  id="checkout-region"
                  name="region"
                  label="Region / State"
                  value={form.region}
                  error={fieldErrors.region}
                  onChange={(value) => update("region", value)}
                />
              </div>
              <CheckoutTextField
                id="checkout-postcode"
                name="postcode"
                label="Postcode"
                required
                value={form.postcode}
                error={fieldErrors.postcode}
                onChange={(value) => update("postcode", value)}
              />
              <CheckoutTextField
                id="checkout-phone"
                name="phone"
                label="Phone"
                type="tel"
                value={form.phone}
                error={fieldErrors.phone}
                onChange={(value) => update("phone", value)}
              />
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

          <div
            id="checkout-status"
            role="status"
            aria-live="polite"
            className={statusMessage ? "mb-4 text-sm text-brand-muted" : "sr-only"}
          >
            {statusMessage}
          </div>
          <p
            id="checkout-form-error"
            role="alert"
            aria-live="assertive"
            className={alertMessage ? "mb-4 text-sm text-red-400" : "sr-only"}
          >
            {alertMessage}
          </p>

          <div className="flex flex-col-reverse items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/cart" className="flex items-center gap-1 text-xs text-brand-muted hover:text-white">
              <ChevronLeft className="h-4 w-4" /> Return to cart
            </Link>
            <button
              type="submit"
              disabled={loading || checkingStock || stockErrors.length > 0}
              className="btn-gold disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  {CHECKOUT_STATUS_PROCESSING}
                </>
              ) : method === "cod" ? (
                "Place Order"
              ) : (
                "Continue to Secure Payment"
              )}
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
