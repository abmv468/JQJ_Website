"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { useCart } from "@/context/CartContext";

function Confirmation() {
  const params = useSearchParams();
  const { clearCart } = useCart();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [orderId, setOrderId] = useState<string | null>(null);
  const ran = useRef(false);

  const sessionId = params.get("session_id");
  const codOrderId = params.get("order_id");
  const method = params.get("method");

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (method === "cod" && codOrderId) {
      setOrderId(codOrderId);
      setStatus("success");
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
            setStatus("error");
          }
        })
        .catch(() => setStatus("error"));
      return;
    }

    setStatus("error");
  }, [sessionId, codOrderId, method, clearCart]);

  if (status === "loading") {
    return <p className="text-sm text-brand-muted">Confirming your order…</p>;
  }

  if (status === "error") {
    return (
      <div className="text-center">
        <h1 className="font-heading text-2xl uppercase tracking-wider2">We couldn&apos;t confirm your order</h1>
        <p className="mt-3 text-sm text-brand-muted">
          If you were charged, please contact support with your payment details.
        </p>
        <Link href="/" className="btn-gold mt-8">Back to Home</Link>
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
