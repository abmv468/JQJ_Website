import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderCatalogSeed } from "../../scripts/generate-catalog-seed.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const PRODUCT_NOT_NULL = new Set(["name", "slug", "price", "stock_count"]);
const VARIANT_NOT_NULL = new Set(["product_id", "sku", "stock_count"]);

function splitTuples(sql: string): string[] {
  const tuples: string[] = [];
  let depth = 0;
  let start = -1;
  let inQuote = false;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (inQuote) {
      if (ch === "'" && sql[i + 1] === "'") {
        i += 1;
        continue;
      }
      if (ch === "'") inQuote = false;
      continue;
    }
    if (ch === "'") {
      inQuote = true;
      continue;
    }
    if (ch === "(") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        tuples.push(sql.slice(start + 1, i));
        start = -1;
      }
    }
  }

  return tuples;
}

function splitFields(tuple: string): string[] {
  const fields: string[] = [];
  let depth = 0;
  let brackets = 0;
  let inQuote = false;
  let start = 0;

  for (let i = 0; i < tuple.length; i += 1) {
    const ch = tuple[i];
    if (inQuote) {
      if (ch === "'" && tuple[i + 1] === "'") {
        i += 1;
        continue;
      }
      if (ch === "'") inQuote = false;
      continue;
    }
    if (ch === "'") {
      inQuote = true;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === "[") brackets += 1;
    else if (ch === "]") brackets -= 1;
    else if (ch === "," && depth === 0 && brackets === 0) {
      fields.push(tuple.slice(start, i).trim());
      start = i + 1;
    }
  }

  fields.push(tuple.slice(start).trim());
  return fields;
}

function columnList(sql: string, table: string): string[] {
  const marker = `insert into public.${table} (`;
  const start = sql.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const open = sql.indexOf("(", start);
  const close = sql.indexOf(")", open);
  return sql
    .slice(open + 1, close)
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);
}

function valuesBlock(sql: string, table: string): string {
  const marker = `insert into public.${table}`;
  const start = sql.indexOf(marker);
  const values = sql.indexOf("values", start);
  const conflict = sql.indexOf("on conflict", values);
  return sql.slice(values, conflict);
}

function assertRows(
  sql: string,
  table: string,
  notNull: Set<string>
) {
  const columns = columnList(sql, table);
  const rows = splitTuples(valuesBlock(sql, table)).map(splitFields);
  expect(rows.length).toBeGreaterThan(0);

  for (const fields of rows) {
    expect(fields).toHaveLength(columns.length);
    columns.forEach((column, index) => {
      const value = fields[index];
      expect(value).not.toMatch(/undefined/);
      if (notNull.has(column)) {
        expect(value).not.toBe("null");
      }
      if (column === "stock_count") {
        expect(value).toMatch(/^\d+$/);
      }
    });
  }

  return { columns, rows };
}

describe("catalog seed generator", () => {
  it("writes numeric stock_count defaults and keeps low_stock_threshold without touching seed.sql", () => {
    const seedPath = path.join(root, "supabase/seed.sql");
    const seedBefore = readFileSync(seedPath, "utf8");
    const sql = renderCatalogSeed();
    expect(readFileSync(seedPath, "utf8")).toBe(seedBefore);
    expect(sql).not.toMatch(/undefined/);

    const products = assertRows(sql, "products", PRODUCT_NOT_NULL);
    const variants = assertRows(sql, "product_variants", VARIANT_NOT_NULL);

    const stockIndex = products.columns.indexOf("stock_count");
    const thresholdIndex = products.columns.indexOf("low_stock_threshold");
    expect(products.rows.every((row) => row[stockIndex] === "0")).toBe(true);
    expect(products.rows.every((row) => row[thresholdIndex] === "5")).toBe(true);
    expect(variants.rows.every((row) => row[row.length - 1] === "0")).toBe(true);
    expect(sql).toContain("'JQJ-BLAPEN-55-GV', 0");
    expect(seedBefore).toContain("'JQJ-BLAPEN-55-GV', 0");
  });
});
