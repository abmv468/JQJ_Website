import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as codCheckout } from "@/app/api/checkout/cod/route";
import { DEFAULT_ORDER_EMAIL_FROM, sendInventoryExceptionAlert, sendOrderEmails } from "@/lib/email";
import { checkoutCustomer, checkoutItem, createCheckoutDb, setActiveDb } from "../helpers/memory-db";

const STORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RETIRED_SHOP = ["dan", "vapes"].join("");
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".css",
  ".sql",
  ".yml",
  ".yaml",
  ".html",
  ".txt",
  ".svg",
  ".example",
]);

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "coverage") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(full, found);
      continue;
    }
    if (TEXT_EXTENSIONS.has(path.extname(entry.name))) found.push(full);
  }
  return found;
}

const send = vi.hoisted(() =>
  vi.fn(async (_payload?: { from?: string }) => ({ data: { id: "email_1" }, error: null }))
);

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

describe("EMAIL_FROM default", () => {
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

  it("sends from the store address when EMAIL_FROM is unset or blank", async () => {
    expect(DEFAULT_ORDER_EMAIL_FROM.toLowerCase().includes(RETIRED_SHOP)).toBe(false);
    expect(DEFAULT_ORDER_EMAIL_FROM).toBe("orders@jqdgroup.com");

    await expect(sendOrderEmails(orderMail)).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ from: DEFAULT_ORDER_EMAIL_FROM, to: orderMail.customerEmail })
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ from: DEFAULT_ORDER_EMAIL_FROM, to: "admin@example.com" })
    );
    expect(fetch).not.toHaveBeenCalled();

    send.mockClear();
    process.env.EMAIL_FROM = "   ";
    await expect(sendOrderEmails(orderMail)).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ from: DEFAULT_ORDER_EMAIL_FROM }));
  });

  it("lets EMAIL_FROM override the store address", async () => {
    process.env.EMAIL_FROM = "orders@example.com";
    await expect(sendOrderEmails(orderMail)).resolves.toBe(true);
    expect(send.mock.calls.map((call) => call[0]?.from)).toEqual([
      "orders@example.com",
      "orders@example.com",
    ]);
  });

  it("sends the inventory-exception alert from the store address", async () => {
    await expect(
      sendInventoryExceptionAlert({
        orderId: "order-email",
        customerEmail: "buyer@example.com",
        totalAmount: 115,
        currency: "USD",
      })
    ).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: DEFAULT_ORDER_EMAIL_FROM,
        to: "admin@example.com",
      })
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still confirms a COD checkout and sends from the store address", async () => {
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
    expect(db.rowsOf("orders")[0].inventory_reserved).toBe(true);
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ from: DEFAULT_ORDER_EMAIL_FROM }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("finds no retired shop name in the store source", () => {
    const hits = sourceFiles(STORE_ROOT).filter((file) =>
      readFileSync(file, "utf8").toLowerCase().includes(RETIRED_SHOP)
    );
    expect(hits.map((file) => path.relative(STORE_ROOT, file))).toEqual([]);
  });
});
