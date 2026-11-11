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

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

// Order mail interpolates customer-controlled text. Escape it before it reaches HTML.
function escapeHtml(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

function itemsTable(items: OrderEmailItem[], currency: SupportedCurrency): string {
  return items
    .map(
      (i) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;">${escapeHtml(i.name)} × ${escapeHtml(i.quantity)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${formatPrice(i.price * i.quantity, {
          currency,
        })}</td>
      </tr>`
    )
    .join("");
}

function buildHtml(data: OrderEmailData, heading: string): string {
  const addr = data.shippingAddress;
  const paymentLabel =
    data.paymentMethod === "cod"
      ? "Cash on Delivery"
      : data.paymentMethod === "airwallex"
        ? "Card (Airwallex)"
        : "Card (Stripe)";
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;color:#111;">
    <div style="background:#010101;padding:28px;text-align:center;">
      <span style="color:#fff;font-size:20px;letter-spacing:3px;">${BRAND}</span>
    </div>
    <div style="padding:28px;">
      <h2 style="font-weight:400;">${escapeHtml(heading)}</h2>
      <p>Hi ${escapeHtml(data.customerName) || "there"},</p>
      <p>Order reference: <strong>${escapeHtml(data.orderId)}</strong></p>
      <p>Payment method: <strong>${escapeHtml(paymentLabel)}</strong></p>
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
        ${escapeHtml(addr.address)}${addr.apartment ? ", " + escapeHtml(addr.apartment) : ""}<br/>
        ${escapeHtml(addr.city)}, ${escapeHtml(addr.region)}<br/>
        ${escapeHtml(addr.country)}
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
