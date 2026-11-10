import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { formatPrice } from "./utils";
import { type SupportedCurrency } from "./currency";

export interface OrderEmailItem {
  name: string;
  quantity: number;
  price: number;
}

export interface OrderEmailData {
  orderId: string;
  customerName: string;
  customerEmail: string;
  items: OrderEmailItem[];
  subtotal: number;
  shipping: number;
  codFee?: number;
  total: number;
  paymentMethod: "stripe" | "cod" | "airwallex";
  currency: SupportedCurrency;
  shippingAddress: {
    address: string;
    apartment?: string;
    city: string;
    region: string;
    country: string;
  };
}

const BRAND = "JQD Group";
const GOLD = "#BB9D7B";

/** Used when EMAIL_FROM is unset or blank. EMAIL_FROM overrides this. */
export const DEFAULT_ORDER_EMAIL_FROM = "orders@jqdgroup.com";

function itemsTable(items: OrderEmailItem[], currency: SupportedCurrency): string {
  return items
    .map(
      (i) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;">${i.name} × ${i.quantity}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${formatPrice(i.price * i.quantity, {
          currency,
        })}</td>
      </tr>`
    )
    .join("");
}

function buildHtml(data: OrderEmailData, heading: string): string {
  const addr = data.shippingAddress;
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;color:#111;">
    <div style="background:#010101;padding:28px;text-align:center;">
      <span style="color:#fff;font-size:20px;letter-spacing:3px;">${BRAND}</span>
    </div>
    <div style="padding:28px;">
      <h2 style="font-weight:400;">${heading}</h2>
      <p>Hi ${data.customerName || "there"},</p>
      <p>Order reference: <strong>${data.orderId}</strong></p>
      <p>Payment method: <strong>${
        data.paymentMethod === "cod"
          ? "Cash on Delivery"
          : data.paymentMethod === "airwallex"
            ? "Card (Airwallex)"
            : "Card (Stripe)"
      }</strong></p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        ${itemsTable(data.items, data.currency)}
        <tr><td style="padding:8px 0;">Subtotal</td><td style="padding:8px 0;text-align:right;">${formatPrice(data.subtotal, {
          currency: data.currency,
        })}</td></tr>
        <tr><td style="padding:8px 0;">Shipping</td><td style="padding:8px 0;text-align:right;">${formatPrice(data.shipping, {
          currency: data.currency,
        })}</td></tr>
        ${
          data.codFee
            ? `<tr><td style="padding:8px 0;">COD Fee</td><td style="padding:8px 0;text-align:right;">${formatPrice(data.codFee, {
                currency: data.currency,
              })}</td></tr>`
            : ""
        }
        <tr><td style="padding:12px 0;font-weight:700;border-top:2px solid #111;">Total</td><td style="padding:12px 0;text-align:right;font-weight:700;border-top:2px solid #111;color:${GOLD};">${formatPrice(data.total, {
    currency: data.currency,
  })}</td></tr>
      </table>
      <h3 style="font-weight:500;">Shipping to</h3>
      <p style="color:#444;line-height:1.5;">
        ${addr.address}${addr.apartment ? ", " + addr.apartment : ""}<br/>
        ${addr.city}, ${addr.region}<br/>
        ${addr.country}
      </p>
      <p style="margin-top:24px;color:#777;font-size:12px;">Thank you for choosing ${BRAND}.</p>
    </div>
  </div>`;
}

function senderAddress(): string {
  const from = process.env.EMAIL_FROM?.trim();
  return from || DEFAULT_ORDER_EMAIL_FROM;
}

const EMAIL_ADDRESS = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const RESEND_KEY = /\bre_[A-Za-z0-9_-]+\b/g;

function redact(message: string) {
  return message.replace(EMAIL_ADDRESS, "[redacted]").replace(RESEND_KEY, "[redacted]").slice(0, 180);
}

function describeSendFailure(reason: unknown): {
  name: string;
  statusCode: number | null;
  message: string;
} {
  if (typeof reason === "string") {
    return { name: "Error", statusCode: null, message: redact(reason) };
  }
  if (reason instanceof Error) {
    const statusCode =
      "statusCode" in reason && typeof reason.statusCode === "number" ? reason.statusCode : null;
    return {
      name: reason.name || "Error",
      statusCode,
      message: redact(reason.message || "email send failed"),
    };
  }
  if (reason && typeof reason === "object") {
    const record = reason as Record<string, unknown>;
    return {
      name: typeof record.name === "string" && record.name ? record.name : "Error",
      statusCode: typeof record.statusCode === "number" ? record.statusCode : null,
      message: redact(
        typeof record.message === "string" && record.message ? record.message : "email send failed"
      ),
    };
  }
  return { name: "Error", statusCode: null, message: "email send failed" };
}

function logSendFailure(orderId: string, label: string, reason: unknown) {
  console.error("[email] send failed", {
    orderId,
    label,
    ...describeSendFailure(reason),
  });
}

function failureFromResult(result: unknown): unknown | null {
  if (!result || typeof result !== "object" || !("error" in result)) return null;
  const error = (result as { error?: unknown }).error;
  return error ? error : null;
}

interface OutboundMail {
  orderId: string;
  label: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

async function deliver(mail: OutboundMail): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return false;

  try {
    const resend = new Resend(apiKey);
    const payload = mail.html
      ? { from: senderAddress(), to: mail.to, subject: mail.subject, html: mail.html }
      : { from: senderAddress(), to: mail.to, subject: mail.subject, text: mail.text ?? "" };
    const failure = failureFromResult(await resend.emails.send(payload));
    if (failure) {
      logSendFailure(mail.orderId, mail.label, failure);
      return false;
    }
    return true;
  } catch (error) {
    logSendFailure(mail.orderId, mail.label, error);
    return false;
  }
}

export async function sendOrderEmails(data: OrderEmailData): Promise<boolean> {
  try {
    if (!process.env.RESEND_API_KEY?.trim()) {
      console.warn("[email] RESEND_API_KEY missing — skipping order emails");
      return false;
    }

    const customerSent = await deliver({
      orderId: data.orderId,
      label: "order confirmation",
      to: data.customerEmail,
      subject: `Your ${BRAND} order ${data.orderId}`,
      html: buildHtml(data, "Thank you for your order"),
    });

    const adminEmail = process.env.ADMIN_EMAIL?.trim();
    if (adminEmail) {
      await deliver({
        orderId: data.orderId,
        label: "order notification",
        to: adminEmail,
        subject: `New order ${data.orderId} — ${formatPrice(data.total, { currency: data.currency })}`,
        html: buildHtml(data, "New order received"),
      });
    }
    return customerSent;
  } catch (error) {
    logSendFailure(data.orderId, "order emails", error);
    return false;
  }
}

export async function claimOrderConfirmation(
  supabase: SupabaseClient,
  orderId: string,
  send: () => Promise<boolean>
): Promise<void> {
  const { data: claimed, error: claimError } = await supabase
    .from("orders")
    .update({ confirmation_email_sent_at: new Date().toISOString() })
    .eq("id", orderId)
    .is("confirmation_email_sent_at", null)
    .select("confirmation_email_sent_at")
    .maybeSingle();
  if (claimError) {
    console.error("[email] confirmation claim failed", orderId);
    return;
  }

  const storedAt = (claimed as { confirmation_email_sent_at?: string | null } | null)
    ?.confirmation_email_sent_at;
  if (!storedAt) return;

  let customerSent = false;
  try {
    customerSent = await send();
  } catch {
    console.error("[email] order confirmation failed", orderId);
  }
  if (customerSent) return;

  const { error: clearError } = await supabase
    .from("orders")
    .update({ confirmation_email_sent_at: null })
    .eq("id", orderId)
    .eq("confirmation_email_sent_at", storedAt);
  if (clearError) {
    console.error("[email] confirmation claim clear failed", orderId);
  }
}

export async function sendInventoryExceptionAlert(input: {
  orderId: string;
  customerEmail?: string | null;
  totalAmount?: number | null;
  currency?: string | null;
}): Promise<void> {
  console.error("[inventory] paid order has no stock; manual review required", input.orderId);
  try {
    const adminEmail = process.env.ADMIN_EMAIL?.trim();
    if (!process.env.RESEND_API_KEY?.trim() || !adminEmail) return;

    await deliver({
      orderId: input.orderId,
      label: "inventory exception",
      to: adminEmail,
      subject: `Manual review required: order ${input.orderId} was paid without stock`,
      text: [
        `Order ${input.orderId} captured a card payment after its stock reservation had been released.`,
        "Stock could not be reserved again, so the order status is inventory_exception and payment_status is succeeded.",
        `Customer: ${input.customerEmail ?? "unknown"}.`,
        `Total: ${input.totalAmount ?? "unknown"} ${input.currency ?? "USD"}.`,
        "Do not ship this order. Refund the payment or source the item.",
      ].join(" "),
    });
  } catch (error) {
    logSendFailure(input.orderId, "inventory exception", error);
  }
}
