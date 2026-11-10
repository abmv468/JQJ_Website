import { Resend } from "resend";
import { formatPrice } from "./utils";
import { type SupportedCurrency } from "./currency";
import { absoluteUrl } from "./seo";

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

export async function sendOrderEmails(data: OrderEmailData): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "orders@danvapes.shop";
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY missing — skipping order emails");
    return;
  }

  const resend = new Resend(apiKey);

  try {
    await resend.emails.send({
      from,
      to: data.customerEmail,
      subject: `Your ${BRAND} order ${data.orderId}`,
      html: buildHtml(data, "Thank you for your order"),
    });

    if (adminEmail) {
      await resend.emails.send({
        from,
        to: adminEmail,
        subject: `New order ${data.orderId} — ${formatPrice(data.total, { currency: data.currency })}`,
        html: buildHtml(data, "New order received"),
      });
    }
  } catch (err) {
    console.error("[email] Failed to send order emails", err);
  }
}

export const UNMATCHED_PAYMENT_SUBJECT = "[JQD] Payment received but order not matched";
export const WEBHOOK_BACKSTOP_SUBJECT = "[JQD] Payment webhook backlog";

export interface UnmatchedPaymentAlertInput {
  orderId: string | null;
  merchantOrderId: string | null;
  paymentIntentId: string | null;
  webhookEventId: string | null;
  amount?: number | null;
  currency?: string | null;
}

export interface WebhookBackstopId {
  rowId: string | null;
  webhookEventId: string | null;
  orderId: string | null;
  paymentId: string | null;
}

export interface PaymentWebhookBackstopInput {
  failedCount: number;
  stuckCount: number;
  failed: WebhookBackstopId[];
  stuck: WebhookBackstopId[];
}

function missingAdminMailConfig(): "RESEND_API_KEY" | "ADMIN_EMAIL" | null {
  if (!process.env.RESEND_API_KEY) return "RESEND_API_KEY";
  if (!process.env.ADMIN_EMAIL) return "ADMIN_EMAIL";
  return null;
}

function adminSender() {
  const missing = missingAdminMailConfig();
  if (missing) return null;
  return {
    resend: new Resend(process.env.RESEND_API_KEY as string),
    from: process.env.EMAIL_FROM || "orders@danvapes.shop",
    to: process.env.ADMIN_EMAIL as string,
  };
}

function idValue(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : "unknown";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mailFromLines(lines: string[]) {
  const text = lines.join("\n");
  return {
    text,
    html: `<pre style="font-family:ui-monospace,monospace">${escapeHtml(text)}</pre>`,
  };
}

function formatHkt(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${pick("year")}-${pick("month")}-${pick("day")} ${pick("hour")}:${pick("minute")}:${pick("second")} HKT`;
}

function adminOrderLink(orderId: string | null) {
  const url = new URL(absoluteUrl("/admin"));
  if (orderId) url.searchParams.set("order", orderId);
  return url.toString();
}

function amountLine(amount: number | null | undefined, currency: string | null | undefined) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  const code = currency && /^[A-Z]{3}$/.test(currency) ? ` ${currency}` : "";
  return `amount: ${amount}${code}`;
}

export async function sendUnmatchedPaymentAlert(input: UnmatchedPaymentAlertInput): Promise<void> {
  const ids = {
    orderId: input.orderId,
    merchantOrderId: input.merchantOrderId,
    paymentIntentId: input.paymentIntentId,
    webhookEventId: input.webhookEventId,
  };
  const missing = missingAdminMailConfig();
  if (missing) {
    console.warn("[email] unmatched payment alert skipped", { missing, ...ids });
    return;
  }

  const sender = adminSender();
  if (!sender) return;

  const lines = [
    "Payment received but the order was not marked paid.",
    `orderId: ${idValue(input.orderId)}`,
    `merchantOrderId: ${idValue(input.merchantOrderId)}`,
    `paymentIntentId: ${idValue(input.paymentIntentId)}`,
    `webhookEventId: ${idValue(input.webhookEventId)}`,
  ];
  const amount = amountLine(input.amount, input.currency);
  if (amount) lines.push(amount);
  lines.push(`time: ${formatHkt()}`);
  lines.push(`admin: ${adminOrderLink(input.orderId)}`);

  const result = await sender.resend.emails.send({
    from: sender.from,
    to: sender.to,
    subject: UNMATCHED_PAYMENT_SUBJECT,
    ...mailFromLines(lines),
  });
  if (result.error) {
    throw new Error("unmatched payment alert was not accepted");
  }
}

function backstopIdBlock(row: WebhookBackstopId) {
  return [
    `webhookEventId: ${idValue(row.webhookEventId)}`,
    `rowId: ${idValue(row.rowId)}`,
    `orderId: ${idValue(row.orderId)}`,
    `paymentId: ${idValue(row.paymentId)}`,
  ].join("\n");
}

function backstopList(rows: WebhookBackstopId[]) {
  const shown = rows.slice(0, 100);
  const blocks = shown.map((row) => backstopIdBlock(row));
  if (rows.length > shown.length) {
    blocks.push(`listed: ${shown.length}`, `unlisted: ${rows.length - shown.length}`);
  }
  return blocks.join("\n\n");
}

export async function sendPaymentWebhookBackstopEmail(
  input: PaymentWebhookBackstopInput
): Promise<void> {
  const missing = missingAdminMailConfig();
  if (missing) {
    console.warn("[email] payment webhook backstop skipped", {
      missing,
      failedCount: input.failedCount,
      stuckCount: input.stuckCount,
    });
    return;
  }

  const sender = adminSender();
  if (!sender) return;

  const lines = [
    `failed: ${input.failedCount}`,
    `stuck: ${input.stuckCount}`,
    `time: ${formatHkt()}`,
    `admin: ${adminOrderLink(null)}`,
  ];
  if (input.failed.length > 0) {
    lines.push("", "failed ids:", backstopList(input.failed));
  }
  if (input.stuck.length > 0) {
    lines.push("", "stuck ids:", backstopList(input.stuck));
  }

  const result = await sender.resend.emails.send({
    from: sender.from,
    to: sender.to,
    subject: WEBHOOK_BACKSTOP_SUBJECT,
    ...mailFromLines(lines),
  });
  if (result.error) {
    throw new Error("payment webhook backstop was not accepted");
  }
}
