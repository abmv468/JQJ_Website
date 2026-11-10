import { describe, expect, it } from "vitest";
import { MemoryDb } from "../helpers/memory-db";

describe("memory db neq", () => {
  it("does not match a row whose filtered column is null", async () => {
    const db = new MemoryDb();
    db.seed("orders", [
      { id: "order-null", status: "pending", payment_status: null },
      { id: "order-pending", status: "pending", payment_status: "pending" },
      { id: "order-paid", status: "paid", payment_status: "succeeded" },
    ]);

    const { data, error } = await db.from("orders").select("id").neq("payment_status", "succeeded");

    expect(error).toBeNull();
    expect(data).toEqual([{ id: "order-pending" }]);
  });

  it("treats a null payment_status as unpaid in the paid-claim filter", async () => {
    const db = new MemoryDb();
    db.seed("orders", [
      { id: "order-null", status: "pending", payment_status: null },
      { id: "order-pending", status: "pending", payment_status: "pending" },
      { id: "order-paid", status: "paid", payment_status: "succeeded" },
    ]);

    const { data, error } = await db
      .from("orders")
      .select("id")
      .or("payment_status.is.null,payment_status.neq.succeeded");

    expect(error).toBeNull();
    expect(data).toEqual([{ id: "order-null" }, { id: "order-pending" }]);
  });
});