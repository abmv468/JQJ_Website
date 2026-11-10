import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as codCheckout } from "@/app/api/checkout/cod/route";
import { sendInventoryExceptionAlert, sendOrderEmails } from "@/lib/email";
import { checkoutCustomer, checkoutItem, createCheckoutDb, setActiveDb } from "../helpers/memory-db";

const send = vi.hoisted(() => vi.fn(async () => ({ data: { id: "email_1" }, error: null })));

vi.mock("resend", () => {
  return {
    Resend: class {
      emails = { send };
    },
  };
});

const orderMail = {
  orderId: "order-email",
  customerName: "Ada Lovelace",
  customerEmail: "buyer@example.com",
  items: [{ name: "Amethyst Bracelet XV (5mm)", quantity: 1, price: 100 }],
  subtotal: 100,
  shipping: 15,
  total: 115,
  paymentMethod: "airwallex" as const,
  currency: "USD" as const,
  shippingAddress: {
    address: "1 Atelier Lane",
    city: "Austin",
    region: "TX",
    country: "United States",
  },
};

describe("EMAIL_FROM unset", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    send.mockClear();
    process.env.RESEND_API_KEY = "test_dummy";
    process.env.ADMIN_EMAIL = "admin@example.com";
    delete process.env.EMAIL_FROM;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("unexpected network call");
      })
    );
  });

  it("skips the order email and logs an error without throwing", async () => {
    await expect(sendOrderEmails(orderMail)).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("EMAIL_FROM is not set")
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("skips the inventory-exception alert without throwing", async () => {
    await expect(
      sendInventoryExceptionAlert({
        orderId: "order-email",
        customerEmail: "buyer@example.com",
        totalAmount: 115,
        currency: "USD",
      })
    ).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("EMAIL_FROM is not set")
    );
  });

  it("still confirms a COD checkout for the shopper", async () => {
    const db = createCheckoutDb();
    setActiveDb(db);

    const response = await codCheckout(
      new Request("http://localhost:3000/api/checkout/cod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [checkoutItem()],
          customer: checkoutCustomer,
          currency: "USD",
          idempotencyKey: "cod-email-from",
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      orderId: expect.any(String),
    });
    expect(db.rowsOf("orders")).toHaveLength(1);
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(send).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
