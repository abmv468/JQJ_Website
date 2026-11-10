import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { products } from "@/data/products";
import { validateCheckoutItems, type InventoryProduct } from "@/lib/inventory";

type SeedVariant = {
  slug: string;
  size: string;
  material: string;
  sku: string;
  stockCount: number;
};

type SeedProduct = {
  slug: string;
  price: string;
};

function splitSqlFields(input: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuote = false;
  let depth = 0;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (inQuote) {
      current += char;
      if (char === "'" && input[index + 1] === "'") {
        current += input[index + 1];
        index += 1;
        continue;
      }
      if (char === "'") inQuote = false;
      continue;
    }
    if (char === "'") {
      inQuote = true;
      current += char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      fields.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) fields.push(current.trim());
  return fields;
}

function unquote(value: string): string {
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

function sqlSection(sql: string, insertStart: string): string {
  const start = sql.indexOf(insertStart);
  if (start < 0) throw new Error(`Missing seed insert: ${insertStart}`);
  const valuesAt = sql.indexOf("values", start);
  const conflictAt = sql.indexOf("on conflict", valuesAt);
  return sql.slice(valuesAt + "values".length, conflictAt);
}

function sqlTuples(section: string): string[] {
  const tuples: string[] = [];
  let current = "";
  let inQuote = false;
  let depth = 0;

  for (let index = 0; index < section.length; index += 1) {
    const char = section[index];
    if (inQuote) {
      current += char;
      if (char === "'" && section[index + 1] === "'") {
        current += section[index + 1];
        index += 1;
        continue;
      }
      if (char === "'") inQuote = false;
      continue;
    }
    if (char === "'") {
      inQuote = true;
      current += char;
      continue;
    }
    if (char === "(") {
      if (depth === 0) current = "";
      depth += 1;
      current += char;
      continue;
    }
    if (char === ")") {
      depth -= 1;
      current += char;
      if (depth === 0) tuples.push(current.slice(1, -1));
      continue;
    }
    if (depth > 0) current += char;
  }
  return tuples;
}

function readSeed() {
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/seed.sql"), "utf8");
  const productsBySlug = new Map<string, SeedProduct>();
  for (const tuple of sqlTuples(sqlSection(sql, "insert into public.products"))) {
    const fields = splitSqlFields(tuple);
    productsBySlug.set(unquote(fields[1]), { slug: unquote(fields[1]), price: fields[4] });
  }

  const variantsBySku = new Map<string, SeedVariant>();
  for (const tuple of sqlTuples(sqlSection(sql, "insert into public.product_variants"))) {
    const fields = splitSqlFields(tuple);
    const slug = fields[0].match(/slug = '([^']+)'/)?.[1];
    if (!slug) throw new Error(`Variant row is missing a product slug: ${tuple}`);
    const variant = {
      slug,
      size: unquote(fields[1]),
      material: unquote(fields[2]),
      sku: unquote(fields[3]),
      stockCount: Number(fields[4]),
    };
    variantsBySku.set(variant.sku, variant);
  }

  return { productsBySlug, variantsBySku };
}

describe("products.ts variants match the seed strings", () => {
  const seed = readSeed();
  const catalogVariants = products.flatMap((product) =>
    (product.variants ?? []).map((variant) => ({ product, variant }))
  );

  it("gives every products.ts variant the seed SKU, size, material, and price", () => {
    expect(catalogVariants.length).toBeGreaterThan(0);
    for (const { product, variant } of catalogVariants) {
      const seeded = seed.variantsBySku.get(variant.sku);
      expect(seeded, variant.sku).toBeDefined();
      expect(seeded?.size, variant.sku).toBe(variant.size);
      expect(seeded?.material, variant.sku).toBe(variant.material);
      expect(seeded?.slug, variant.sku).toBe(product.slug);
      expect(seed.productsBySlug.get(product.slug)?.price, product.slug).toBe(String(product.price));
    }
    expect(catalogVariants.map(({ variant }) => variant.sku)).toContain("JQJ-BLAPEN-55-GV");
  });

  it("findVariant no-SKU fallback matches each products.ts variant", () => {
    const inventory = new Map<string, InventoryProduct>();
    for (const { product } of catalogVariants) {
      if (inventory.has(product.slug)) continue;
      const rows = [...seed.variantsBySku.values()].filter((variant) => variant.slug === product.slug);
      inventory.set(product.slug, {
        id: product.slug,
        slug: product.slug,
        name: product.name,
        price: product.price,
        stock_count: product.stockCount ?? 0,
        in_stock: product.inStock,
        low_stock_threshold: product.lowStockThreshold ?? 5,
        sku: product.sku ?? null,
        product_variants: rows.map((variant) => ({
          id: variant.sku,
          product_id: product.slug,
          size: variant.size,
          material: variant.material,
          sku: variant.sku,
          stock_count: Math.max(1, variant.stockCount),
        })),
      });
    }

    for (const { product, variant } of catalogVariants) {
      const result = validateCheckoutItems(
        [
          {
            slug: product.slug,
            name: product.name,
            price: product.price,
            quantity: 1,
            size: variant.size,
            material: variant.material,
          },
        ],
        inventory
      );
      expect(result.ok, `${variant.sku} ${result.errors.join("; ")}`).toBe(true);
      expect(result.resolved[0]?.variant?.sku, variant.sku).toBe(variant.sku);
    }
  });
});
