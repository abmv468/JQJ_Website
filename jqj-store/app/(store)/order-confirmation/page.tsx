"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { useCart } from "@/context/CartContext";

function Confirmation() {
  const params = useSearchParams();
  const { clearCart } = useCart();
  const [status, setStatus] = useState<
    "loading" | "pending" | "success" | "failed" | "cancelled" | "error"
  >("loading");
  const [orderId, setOrderId] = useState<string | null>(null);
  const ran = useRef(false);

  const sessionId = params.get("session_id");
  const codOrderId = params.get("order_id");
  const method = params.get("method");
  const provider = params.get("provider");
  const returnState = params.get("state");

  const verifyAirwallexOrder = useCallback(
    async (targetOrderId: string) => {
      const response = await fetch("/api/checkout/airwallex/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: targetOrderId, refresh: true }),
      });
      const data = await response.json();

      if (!response.ok && response.status !== 202 && response.status !== 402) {
        throw new Error(data.error || "Unable to verify payment status");
      }

      if (data.orderId) {
        setOrderId(data.orderId);
      } else {
        setOrderId(targetOrderId);
      }

      if (data.succeeded) {
        setStatus("success");
        clearCart();
        return;
      }

      if (data.failed) {
        if (data.paymentStatus === "cancelled" || data.paymentStatus === "abandoned") {
          setStatus("cancelled");
          return;
        }
        setStatus("failed");
        return;
      }

      setStatus("pending");
    },
    [clearCart]
  );

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (method === "cod" && codOrderId) {
      setOrderId(codOrderId);
      setStatus("success");
      return;
    }

    if (provider === "airwallex" && codOrderId) {
      void verifyAirwallexOrder(codOrderId).catch(() => {
        setStatus(returnState === "failed" ? "failed" : "error");
      });
      return;
    }

    if (sessionId) {
      fetch("/api/checkout/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.orderId) {
            setOrderId(data.orderId);
            setStatus("success");
            clearCart();
          } else {
            setStatus("failed");
          }
        })
        .catch(() => setStatus("failed"));
      return;
    }

    setStatus("error");
  }, [sessionId, codOrderId, method, provider, returnState, verifyAirwallexOrder, clearCart]);

  if (status === "loading") {
    return (
      <p className="text-sm text-brand-muted">
        {provider === "airwallex"
          ? "Verifying your payment status…"
          : "Confirming your order…"}
      </p>
    );
  }

  if (status === "pending") {
    return (
      <div className="text-center">
        <h1 className="font-heading text-2xl uppercase tracking-wider2">Payment verification pending</h1>
        <p className="mt-3 text-sm text-brand-muted">
          We received your return from Airwallex, but payment confirmation is still pending.
        </p>
        {orderId && (
          <p className="mt-2 text-xs text-brand-muted">
            Order reference: <span className="text-white">{orderId}</span>
          </p>
        )}
        <div className="mt-8 flex justify-center gap-4">
          <button
            type="button"
            className="btn-gold"
            onClick={() => {
              if (orderId) {
                setStatus("loading");
                void verifyAirwallexOrder(orderId).catch(() => setStatus("error"));
              }
            }}
          >
            Check Payment Status
          </button>
          <Link href="/checkout" className="btn-secondary">
            Return to Checkout
          </Link>
        </div>
      </div>
    );
  }

  if (status === "failed" || status === "cancelled" || status === "error") {
    return (
      <div className="text-center">
        <h1 className="font-heading text-2xl uppercase tracking-wider2">
          {status === "cancelled"
            ? "Payment was cancelled"
            : status === "failed"
              ? "Payment was not completed"
              : "We couldn&apos;t confirm your order"}
        </h1>
        <p className="mt-3 text-sm text-brand-muted">
          {status === "cancelled"
            ? "You can return to checkout to try again."
            : "If you were charged, please contact support with your payment details."}
        </p>
        {orderId && (
          <p className="mt-2 text-xs text-brand-muted">
            Order reference: <span className="text-white">{orderId}</span>
          </p>
        )}
        <div className="mt-8 flex justify-center gap-4">
          {orderId && provider === "airwallex" && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setStatus("loading");
                void verifyAirwallexOrder(orderId).catch(() => setStatus("error"));
              }}
            >
              Re-check Status
            </button>
          )}
          <Link href="/checkout" className="btn-gold">
            Return to Checkout
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center">
      <CheckCircle2 className="mx-auto h-14 w-14 text-brand-gold" />
      <h1 className="mt-6 font-heading text-2xl uppercase tracking-wider2">Thank you for your order</h1>
      <p className="mt-3 text-sm text-brand-muted">
        {method === "cod"
          ? "Your Cash on Delivery order has been placed."
          : provider === "airwallex"
            ? "Your Airwallex payment was successful."
            : "Your payment was successful."}
      </p>
      {orderId && (
        <p className="mt-2 text-xs text-brand-muted">
          Order reference: <span className="text-white">{orderId}</span>
        </p>
      )}
      <p className="mt-4 text-sm text-brand-muted">
        A confirmation email is on its way to your inbox.
      </p>
      <div className="mt-8 flex justify-center gap-4">
        <Link href="/new" className="btn-secondary">Continue Shopping</Link>
        <Link href="/account" className="btn-gold">View Orders</Link>
      </div>
    </div>
  );
}

export default function OrderConfirmationPage() {
  return (
    <div className="container-site flex min-h-[60vh] items-center justify-center py-20">
      <Suspense fallback={<p className="text-sm text-brand-muted">Loading…</p>}>
        <Confirmation />
      </Suspense>
    </div>
  );
}
