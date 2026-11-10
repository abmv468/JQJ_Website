import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/checkout/cod/route";
import { normalizeCurrency } from "@/lib/currency";
import { sendOrderEmails } from "@/lib/email";
import {
  checkoutCustomer,
  checkoutItem,
  createCheckoutDb,
  setActiveDb,
  type MemoryDb,
} from "../helpers/memory-db";

vi.mock("@/lib/email", async () => {
  const actual = await vi.importActual<typeof import("@/lib/email")>("@/lib/email");
  return {
    ...actual,
    sendOrderEmails: vi.fn(actual.sendOrderEmails),
  };
});

function request(body: unknown) {
  return new Request("http://localhost:3000/api/checkout/cod", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("COD order currency", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    delete process.env.RESEND_API_KEY;
    delete process.env.ADMIN_EMAIL;
    vi.mocked(sendOrderEmails).mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("unexpected network call");
      })
    );
  });

  it.each(["EUR", "GBP", "HKD", "USD"])(
    "stores and emails USD when the shopper display currency is %s",
    async (displayCurrency) => {
      const response = await POST(
        request({
          items: [checkoutItem({ price: 1, quantity: 2 })],
          customer: checkoutCustomer,
          currency: displayCurrency,
          idempotencyKey: `cod-currency-${displayCurrency}`,
        })
      );

      expect(response.status).toBe(200);
      expect(db.rowsOf("orders")).toHaveLength(1);
      expect(db.rowsOf("orders")[0]).toMatchObject({
        currency: "USD",
        subtotal_amount: 200,
        shipping_amount: 15,
        total_amount: 235,
        shipping_address: expect.objectContaining({
          payment_method: "cod",
          cod_fee: 20,
          currency: normalizeCurrency(displayCurrency),
        }),
      });
      expect(sendOrderEmails).toHaveBeenCalledTimes(1);
      expect(sendOrderEmails).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: "USD",
          subtotal: 200,
          shipping: 15,
          codFee: 20,
          total: 235,
          paymentMethod: "cod",
        })
      );
      expect(fetch).not.toHaveBeenCalled();
    }
  );
});
