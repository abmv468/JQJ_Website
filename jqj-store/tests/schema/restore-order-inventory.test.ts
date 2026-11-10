import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCheckoutDb } from "../helpers/memory-db";
import { migrationsDir } from "../helpers/schema";

const PAID_MESSAGE = "Order is paid; inventory not restored";

function stripSqlComments(sql: string) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
}

function migrationFiles() {
  return readdirSync(migrationsDir())
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

function paidRestoreMigration() {
  const match = migrationFiles()
    .map((name) => ({
      name,
      sql: readFileSync(path.join(migrationsDir(), name), "utf8"),
    }))
    .reverse()
    .find((file) => stripSqlComments(file.sql).includes(PAID_MESSAGE));
  expect(match, "migration that skips restore for a paid order").toBeTruthy();
  return match!;
}

describe("restore_order_inventory paid-order contract", () => {
  const file = paidRestoreMigration();
  const executable = stripSqlComments(file.sql);

  it("is a migration later than the store baseline and the Airwallex columns", () => {
    expect(file.name > "20261023190000").toBe(true);
    expect(migrationFiles().at(-1)).toBe(file.name);
  });

  it("keeps the signature, security invoker, and search_path, and does not grant execute to anon or authenticated", () => {
    expect(executable).toMatch(
      /create or replace function public\.restore_order_inventory\(p_order_id uuid, order_items jsonb\)\s*returns table\(success boolean, was_reserved boolean, message text\)\s*language plpgsql\s*security invoker\s*set search_path = public/i
    );
    expect(executable).not.toMatch(/security definer/i);
    expect(executable).toMatch(
      /revoke execute on function public\.restore_order_inventory\(uuid, jsonb\) from public, anon, authenticated\s*;/i
    );
    expect(executable).toMatch(
      /grant execute on function public\.restore_order_inventory\(uuid, jsonb\) to service_role\s*;/i
    );
    expect(executable).not.toMatch(
      /grant execute on function public\.restore_order_inventory\(uuid, jsonb\) to (public|anon|authenticated)\b/i
    );
  });

  it("reads payment_status under the order row lock and skips a paid order before restoring", () => {
    const fn = executable.slice(
      executable.toLowerCase().indexOf("create or replace function public.restore_order_inventory")
    );
    const lockedRead = fn.search(
      /select\s+inventory_reserved\s*,\s*payment_status\s+into\s+is_reserved\s*,\s*order_payment_status\s+from\s+orders\s+where\s+id\s*=\s*p_order_id\s+for\s+update/i
    );
    const paidBranch = fn.indexOf("if order_payment_status = 'succeeded' then");
    const restoreCall = fn.search(/perform\s+restore_inventory\s*\(\s*order_items\s*\)/i);
    expect(lockedRead).toBeGreaterThanOrEqual(0);
    expect(paidBranch).toBeGreaterThan(lockedRead);
    expect(restoreCall).toBeGreaterThan(paidBranch);
    expect(fn).toContain(
      "return query select false, is_reserved, 'Order is paid; inventory not restored'"
    );
    expect(fn).toContain("return query select true, false, 'Inventory already restored'");
    expect(fn).toContain("return query select true, true, 'Inventory restored'");
  });

  it("leaves a paid reserved order unchanged", async () => {
    const db = createCheckoutDb();
    db.rowsOf("products")[0].stock_count = 4;
    db.seed("orders", [
      {
        id: "order-paid",
        status: "paid",
        payment_status: "succeeded",
        inventory_reserved: true,
        total_amount: 115,
      },
    ]);

    const result = await db.rpc("restore_order_inventory", {
      p_order_id: "order-paid",
      order_items: [{ product_id: "prod-amethyst", variant_id: null, quantity: 1 }],
    });

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      { success: false, was_reserved: true, message: PAID_MESSAGE },
    ]);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      inventory_reserved: true,
      payment_status: "succeeded",
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
  });

  it("restores an unpaid order that still holds a reservation", async () => {
    const db = createCheckoutDb();
    db.rowsOf("products")[0].stock_count = 4;
    db.seed("orders", [
      {
        id: "order-open",
        status: "pending",
        payment_status: "requires_payment_method",
        inventory_reserved: true,
        total_amount: 115,
      },
    ]);

    const result = await db.rpc("restore_order_inventory", {
      p_order_id: "order-open",
      order_items: [{ product_id: "prod-amethyst", variant_id: null, quantity: 1 }],
    });

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      { success: true, was_reserved: true, message: "Inventory restored" },
    ]);
    expect(db.rowsOf("orders")[0].inventory_reserved).toBe(false);
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
  });

  it("does not restore again when the reservation is already released", async () => {
    const db = createCheckoutDb();
    db.rowsOf("products")[0].stock_count = 5;
    db.seed("orders", [
      {
        id: "order-done",
        status: "failed",
        payment_status: "failed",
        inventory_reserved: false,
        total_amount: 115,
      },
    ]);

    const result = await db.rpc("restore_order_inventory", {
      p_order_id: "order-done",
      order_items: [{ product_id: "prod-amethyst", variant_id: null, quantity: 1 }],
    });

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      { success: true, was_reserved: false, message: "Inventory already restored" },
    ]);
    expect(db.rowsOf("orders")[0].inventory_reserved).toBe(false);
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
  });
});
