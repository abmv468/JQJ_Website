"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { confirmationCopy } from "@/lib/checkout-copy";
import { SUPPORT_EMAIL } from "@/lib/support";

const actionRowClass =
  "mt-8 flex w-full flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:justify-center";
const actionButtonClass = "w-full whitespace-nowrap sm:w-auto";

function StatusMessage({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-3 text-sm text-brand-muted"
    >
      <span
        aria-hidden="true"
        className="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-white/25 border-t-brand-gold motion-safe:animate-spin"
      />
      {children}
    </p>
  );
}

function OrderReference({ orderId }: { orderId: string }) {
  return (
    <p className="mt-3 text-xs text-brand-muted">
      {confirmationCopy.orderReferenceLabel}{" "}
      <span className="mt-1 block break-all font-mono text-[13px] leading-5 text-white">
        {orderId}
      </span>
    </p>
  );
}

function SupportContact({ lead, tail }: { lead: string; tail: string }) {
  return (
    <p className="mt-2 text-xs text-brand-muted">
      {lead}{" "}
      <a className="text-brand-gold underline underline-offset-2" href={`mailto:${SUPPORT_EMAIL}`}>
        {SUPPORT_EMAIL}
      </a>{" "}
      {tail}
    </p>
  );
}

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

      if (
        data.paymentStatus === "requires_payment_method" ||
        data.paymentStatus === "requires_customer_action"
      ) {
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
      <StatusMessage>
        {provider === "airwallex" ? confirmationCopy.verifying : confirmationCopy.confirming}
      </StatusMessage>
    );
  }

  if (status === "pending") {
    return (
      <div className="w-full max-w-xl text-center">
        <h1 className="font-heading text-2xl uppercase tracking-wider2">{confirmationCopy.pendingTitle}</h1>
        <p className="mt-3 text-sm text-brand-muted">{confirmationCopy.pendingBody}</p>
        <SupportContact
          lead={confirmationCopy.pendingSupportLead}
          tail={confirmationCopy.pendingSupportTail}
        />
        {orderId && <OrderReference orderId={orderId} />}
        <div className={actionRowClass}>
          <button
            type="button"
            className={`btn-gold ${actionButtonClass}`}
            onClick={() => {
              if (orderId) {
                setStatus("loading");
                void verifyAirwallexOrder(orderId).catch(() => setStatus("error"));
              }
            }}
          >
            {confirmationCopy.checkPaymentStatus}
          </button>
          <Link href="/checkout" className={`btn-secondary ${actionButtonClass}`}>
            {confirmationCopy.returnToCheckout}
          </Link>
        </div>
      </div>
    );
  }

  if (status === "failed" || status === "cancelled" || status === "error") {
    return (
      <div className="w-full max-w-xl text-center">
        <h1 className="font-heading text-2xl uppercase tracking-wider2">
          {status === "cancelled"
            ? confirmationCopy.cancelledTitle
            : status === "failed"
              ? confirmationCopy.failedTitle
              : confirmationCopy.invalidTitle}
        </h1>
        <p className="mt-3 text-sm text-brand-muted">
          {status === "cancelled" ? confirmationCopy.cancelledBody : confirmationCopy.chargedBody}
        </p>
        <SupportContact lead={confirmationCopy.supportLead} tail={confirmationCopy.supportTail} />
        {orderId && <OrderReference orderId={orderId} />}
        <div className={actionRowClass}>
          {orderId && provider === "airwallex" && (
            <button
              type="button"
              className={`btn-secondary ${actionButtonClass}`}
              onClick={() => {
                setStatus("loading");
                void verifyAirwallexOrder(orderId).catch(() => setStatus("error"));
              }}
            >
              {confirmationCopy.recheckStatus}
            </button>
          )}
          <Link href="/checkout" className={`btn-gold ${actionButtonClass}`}>
            {confirmationCopy.returnToCheckout}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl text-center">
      <CheckCircle2 className="mx-auto h-14 w-14 text-brand-gold" />
      <h1 className="mt-6 font-heading text-2xl uppercase tracking-wider2">{confirmationCopy.thankYou}</h1>
      <p className="mt-3 text-sm text-brand-muted">
        {method === "cod"
          ? confirmationCopy.codSuccess
          : provider === "airwallex"
            ? confirmationCopy.airwallexSuccess
            : confirmationCopy.paymentSuccess}
      </p>
      {orderId && <OrderReference orderId={orderId} />}
      <p className="mt-4 text-sm text-brand-muted">{confirmationCopy.emailOnTheWay}</p>
      <div className={actionRowClass}>
        <Link href="/new" className={`btn-secondary ${actionButtonClass}`}>
          {confirmationCopy.continueShopping}
        </Link>
        <Link href="/account" className={`btn-gold ${actionButtonClass}`}>
          {confirmationCopy.viewOrders}
        </Link>
      </div>
    </div>
  );
}

export default function OrderConfirmationPage() {
  return (
    <div className="container-site flex min-h-[60vh] items-center justify-center py-20">
      <Suspense fallback={<p className="text-sm text-brand-muted">{confirmationCopy.loading}</p>}>
        <Confirmation />
      </Suspense>
    </div>
  );
}
