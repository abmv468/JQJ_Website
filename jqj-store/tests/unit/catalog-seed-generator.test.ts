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
    const slugIndex = products.columns.indexOf("slug");
    const skuIndex = variants.columns.indexOf("sku");
    const variantStockIndex = variants.columns.indexOf("stock_count");
    const thresholdIndex = products.columns.indexOf("low_stock_threshold");
    expect(stockIndex).toBeGreaterThanOrEqual(0);
    expect(variantStockIndex).toBeGreaterThanOrEqual(0);

    const productStockBySlug = Object.fromEntries(
      products.rows.map((row) => [unquote(row[slugIndex]), row[stockIndex]])
    );
    const variantStockBySku = Object.fromEntries(
      variants.rows.map((row) => [unquote(row[skuIndex]), row[variantStockIndex]])
    );

    expect(products.rows.map((row) => unquote(row[slugIndex]))).toEqual([
      "red-leopard-skin-jasper-bracelet-iii",
      "raw-brown-tourmaline-bracelet-i",
      "sodalite-bracelet-viii",
      "amethyst-bracelet-xv",
      "silver-bracelet-iv",
      "labradorite-bracelet-v",
      "blue-lace-agate-silver-pendant",
      "labradorite-silver-pendant",
      "pearl-silver-necklace-v",
    ]);
    expect(products.rows.map((row) => row[stockIndex])).toEqual([
      "12",
      "8",
      "15",
      "20",
      "9",
      "6",
      "18",
      "11",
      "5",
    ]);
    expect(variants.rows.map((row) => unquote(row[skuIndex]))).toEqual([
      "JQJ-RLSJ-III-S-SS",
      "JQJ-RLSJ-III-M-SS",
      "JQJ-RLSJ-III-L-SS",
      "JQJ-BLAPEN-45-SS",
      "JQJ-BLAPEN-55-SS",
      "JQJ-BLAPEN-55-GV",
    ]);
    expect(variants.rows.map((row) => row[variantStockIndex])).toEqual([
      "4",
      "5",
      "3",
      "7",
      "8",
      "3",
    ]);
    for (const value of Object.values(productStockBySlug)) {
      expect(value).toMatch(/^[1-9]\d*$/);
    }
    for (const value of Object.values(variantStockBySku)) {
      expect(value).toMatch(/^[1-9]\d*$/);
    }
    expect(products.rows.every((row) => row[thresholdIndex] === "5")).toBe(true);
    expect(seedBefore).toContain("'JQJ-BLAPEN-55-GV', 3");
  });
});

function unquote(value: string): string {
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value;
}
