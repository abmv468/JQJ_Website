import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { POST as postCard } from "@/app/api/checkout/airwallex/route";
import { POST as postCod } from "@/app/api/checkout/cod/route";
import { GET as getShippingConfig } from "@/app/api/checkout/shipping/route";
import {
  SHIPPING_METHOD_UNAVAILABLE_MESSAGE,
  isExpressShippingEnabled,
} from "@/lib/express-shipping";
import * as inventory from "@/lib/inventory";
import { createAirwallexPaymentIntent } from "@/lib/payments/airwallex";
import { computeShippingUsd } from "@/lib/shipping";
import * as admin from "@/lib/supabase/admin";
import {
  checkoutCustomer,
  checkoutItem,
  createCheckoutDb,
  setActiveDb,
  type MemoryDb,
} from "../helpers/memory-db";

vi.mock("@/lib/payments/airwallex", async () => {
  const actual = await vi.importActual<typeof import("@/lib/payments/airwallex")>(
    "@/lib/payments/airwallex"
  );
  return {
    ...actual,
    createAirwallexPaymentIntent: vi.fn(),
    retrieveAirwallexPaymentIntent: vi.fn(),
  };
});

const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const COD_FEE = 20;

const THRESHOLDS = [
  { usd: 249.99, shipping: 15 },
  { usd: 250, shipping: 0 },
  { usd: 300, shipping: 0 },
] as const;

function setFlag(value: string | undefined) {
  if (value === undefined) delete process.env.EXPRESS_SHIPPING_ENABLED;
  else process.env.EXPRESS_SHIPPING_ENABLED = value;
}

function cardRequest(body: unknown) {
  return new Request("http://localhost:3000/api/checkout/airwallex", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function codRequest(body: unknown) {
  return new Request("http://localhost:3000/api/checkout/cod", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function spyOnInserts(db: MemoryDb) {
  const inserts: string[] = [];
  const from = db.from.bind(db);
  vi.spyOn(db, "from").mockImplementation((table: string) => {
    const query = from(table);
    const insert = query.insert.bind(query);
    query.insert = ((payload: Parameters<typeof query.insert>[0]) => {
      inserts.push(table);
      return insert(payload);
    }) as typeof query.insert;
    return query;
  });
  return inserts;
}

describe("EXPRESS_SHIPPING_ENABLED", () => {
  let db: MemoryDb;
  let inserts: string[] = [];
  let reserveSpy: MockInstance<typeof inventory.reserveStockForOrder>;

  beforeEach(() => {
    setFlag(undefined);
    delete process.env.RESEND_API_KEY;
    db = createCheckoutDb();
    setActiveDb(db);
    inserts = spyOnInserts(db);
    reserveSpy = vi.spyOn(inventory, "reserveStockForOrder");
    vi.spyOn(admin, "createAdminClient");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("unexpected network call");
      })
    );
    vi.mocked(createAirwallexPaymentIntent).mockReset();
    vi.mocked(createAirwallexPaymentIntent).mockResolvedValue({
      id: "int_test",
      request_id: REQUEST_ID,
      status: "REQUIRES_PAYMENT_METHOD",
      amount: 115,
      currency: "USD",
      client_secret: "secret_test",
      merchant_order_id: "order",
    });
  });

  afterEach(() => {
    setFlag(undefined);
    vi.restoreAllMocks();
  });

  it("is on only when the env var is exactly true", () => {
    setFlag(undefined);
    expect(isExpressShippingEnabled()).toBe(false);
    for (const value of ["false", "TRUE", "True", "1", "yes", "", " true "]) {
      setFlag(value);
      expect(isExpressShippingEnabled()).toBe(false);
    }
    setFlag("true");
    expect(isExpressShippingEnabled()).toBe(true);
  });

  it.each([
    [undefined, false],
    ["true", true],
    ["TRUE", false],
    ["false", false],
    ["1", false],
    ["", false],
  ] as const)("GET reports the flag when EXPRESS_SHIPPING_ENABLED is %s", async (flag, enabled) => {
    setFlag(flag);
    const response = await getShippingConfig();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ expressShippingEnabled: enabled });
    expect(db.rowsOf("orders")).toHaveLength(0);
    expect(db.rpcCalls).toHaveLength(0);
    expect(inserts).toEqual([]);
    expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  describe.each(["card", "cod"] as const)("%s with the flag off", (channel) => {
    it.each(THRESHOLDS)(
      "still quotes USD $usd at $shipping",
      async ({ usd, shipping }) => {
        setFlag(undefined);
        expect(computeShippingUsd(usd)).toBe(shipping);
        db.rowsOf("products")[0].price = usd;

        const response =
          channel === "card"
            ? await postCard(
                cardRequest({
                  items: [checkoutItem()],
                  customer: checkoutCustomer,
                  currency: "USD",
                  shippingMethod: "standard",
                  idempotencyKey: REQUEST_ID,
                })
              )
            : await postCod(
                codRequest({
                  items: [checkoutItem()],
                  customer: checkoutCustomer,
                  currency: "USD",
                  shippingMethod: "standard",
                  idempotencyKey: `cod-${usd}`,
                })
              );

        expect(response.status).toBe(200);
        const codFee = channel === "cod" ? COD_FEE : 0;
        expect(db.rowsOf("orders")[0]).toMatchObject({
          subtotal_amount: usd,
          shipping_amount: shipping,
          total_amount: usd + shipping + codFee,
        });
        expect(reserveSpy).toHaveBeenCalledTimes(1);
        expect(db.rpcCalls.filter((call) => call.fn === "reserve_order_inventory")).toHaveLength(1);
        expect(inserts).toContain("orders");
        if (channel === "card") {
          expect(createAirwallexPaymentIntent).toHaveBeenCalledWith(
            expect.objectContaining({ amount: usd + shipping, currency: "USD" })
          );
        } else {
          expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();
        }
      }
    );
  });

  describe.each(["card", "cod"] as const)("%s rejects a forged method when the flag is off", (channel) => {
    it.each([
      undefined,
      "false",
      "TRUE",
      "1",
      "yes",
      "",
      " true ",
    ] as const)("EXPRESS_SHIPPING_ENABLED=%s rejects expedited before any write", async (flag) => {
      setFlag(flag);
      const body = {
        items: [checkoutItem()],
        customer: checkoutCustomer,
        currency: "USD",
        shippingMethod: "expedited",
        idempotencyKey: channel === "card" ? REQUEST_ID : `cod-forged-${String(flag)}`,
      };
      const response =
        channel === "card" ? await postCard(cardRequest(body)) : await postCod(codRequest(body));

      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({
        error: SHIPPING_METHOD_UNAVAILABLE_MESSAGE,
      });
      expect(SHIPPING_METHOD_UNAVAILABLE_MESSAGE).not.toMatch(/UPS|Express/);
      expect(db.rowsOf("orders")).toHaveLength(0);
      expect(db.rowsOf("order_items")).toHaveLength(0);
      expect(db.rowsOf("payments")).toHaveLength(0);
      expect(inserts).toEqual([]);
      expect(reserveSpy).not.toHaveBeenCalled();
      expect(db.rpcCalls).toHaveLength(0);
      expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();
      expect(admin.createAdminClient).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });

    it.each(["express", "ups", "UPS Express", "priority", "overnight"] as const)(
      "rejects shippingMethod %s",
      async (shippingMethod) => {
        setFlag(undefined);
        const body = {
          items: [checkoutItem()],
          customer: checkoutCustomer,
          currency: "USD",
          shippingMethod,
          idempotencyKey: channel === "card" ? REQUEST_ID : `cod-${shippingMethod}`,
        };
        const response =
          channel === "card" ? await postCard(cardRequest(body)) : await postCod(codRequest(body));

        expect(response.status).toBe(400);
        expect(db.rowsOf("orders")).toHaveLength(0);
        expect(inserts).toEqual([]);
        expect(reserveSpy).not.toHaveBeenCalled();
        expect(db.rpcCalls).toHaveLength(0);
        expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();
      }
    );

    it("rejects a non-string method", async () => {
      setFlag("false");
      const body = {
        items: [checkoutItem()],
        customer: checkoutCustomer,
        currency: "USD",
        shippingMethod: { name: "express" },
        idempotencyKey: channel === "card" ? REQUEST_ID : "cod-object",
      };
      const response =
        channel === "card" ? await postCard(cardRequest(body)) : await postCod(codRequest(body));
      expect(response.status).toBe(400);
      expect(inserts).toEqual([]);
      expect(reserveSpy).not.toHaveBeenCalled();
      expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();
      expect(db.rowsOf("orders")).toHaveLength(0);
    });
  });

  describe.each(["card", "cod"] as const)("%s with the flag on", (channel) => {
    it.each(THRESHOLDS)(
      "keeps the current quote for an expedited method at USD $usd",
      async ({ usd, shipping }) => {
        setFlag("true");
        db.rowsOf("products")[0].price = usd;
        const body = {
          items: [checkoutItem()],
          customer: checkoutCustomer,
          currency: "USD",
          shippingMethod: "expedited",
          idempotencyKey: channel === "card" ? REQUEST_ID : `cod-on-${usd}`,
        };
        const response =
          channel === "card" ? await postCard(cardRequest(body)) : await postCod(codRequest(body));

        expect(response.status).toBe(200);
        const codFee = channel === "cod" ? COD_FEE : 0;
        expect(db.rowsOf("orders")[0]).toMatchObject({
          subtotal_amount: usd,
          shipping_amount: shipping,
          total_amount: usd + shipping + codFee,
        });
        expect(reserveSpy).toHaveBeenCalledTimes(1);
        expect(db.rpcCalls.filter((call) => call.fn === "reserve_order_inventory")).toHaveLength(1);
        expect(inserts).toContain("orders");
        if (channel === "card") {
          expect(createAirwallexPaymentIntent).toHaveBeenCalledWith(
            expect.objectContaining({ amount: usd + shipping, currency: "USD" })
          );
          const payload = await response.json();
          expect(JSON.stringify(payload)).not.toMatch(/\bUPS\b|\bExpress\b/);
        } else {
          expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();
        }
      }
    );
  });
});
