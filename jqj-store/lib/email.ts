import { Resend } from "resend";
import { isValidSingleEmail, normalizeSingleEmail } from "./email-address";
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

function readAdminAddress(): string | null {
  const raw = process.env.ADMIN_EMAIL;
  if (typeof raw !== "string" || !raw.trim()) return null;
  if (!isValidSingleEmail(raw)) {
    console.error("[email] skipped send, invalid env", "ADMIN_EMAIL");
    return null;
  }
  return normalizeSingleEmail(raw);
}

function readFromAddress(): string | null {
  const raw = process.env.EMAIL_FROM;
  if (typeof raw !== "string" || !isValidSingleEmail(raw)) {
    console.error("[email] skipped send, invalid env", "EMAIL_FROM");
    return null;
  }
  return normalizeSingleEmail(raw);
}

export async function sendOrderEmails(data: OrderEmailData): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = readFromAddress();
  const adminEmail = readAdminAddress();
  const customerEmail = normalizeSingleEmail(
    typeof data.customerEmail === "string" ? data.customerEmail : ""
  );
  const customerEmailOk = isValidSingleEmail(customerEmail);

  if (!customerEmailOk) {
    console.error("[email] skipped customer confirmation for order", data.orderId);
  }

  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY missing — skipping order emails");
    return;
  }

  const resend = new Resend(apiKey);

  try {
    if (customerEmailOk && from) {
      await resend.emails.send({
        from,
        to: customerEmail,
        subject: `Your ${BRAND} order ${data.orderId}`,
        html: buildHtml(data, "Thank you for your order"),
      });
    }

    if (adminEmail && from) {
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
