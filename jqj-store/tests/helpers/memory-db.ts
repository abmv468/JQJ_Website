import { loadStoreSchema, type StoreSchema } from "./schema";

export interface DbError extends Error {
  code?: string;
}

export interface QueryFilter {
  op: "eq" | "neq" | "in" | "lt" | "is";
  column: string;
  value: unknown;
}

type Row = Record<string, unknown>;
type FailWhen = (table: string, op: string, filters: QueryFilter[]) => DbError | null;

interface QueryResult {
  data: unknown;
  error: DbError | null;
  count: number | null;
}

const ORDER_FK: Record<string, string> = {
  payments: "order_id",
  order_items: "order_id",
  order_refunds: "order_id",
  payment_refunds: "order_id",
};

let activeDb: MemoryDb | null = null;

export function setActiveDb(db: MemoryDb) {
  activeDb = db;
}

export function getActiveDb() {
  if (!activeDb) {
    throw new Error("Test Supabase client was not initialized");
  }
  return activeDb;
}

export function dbError(message: string, code?: string): DbError {
  const error = new Error(message) as DbError;
  error.code = code;
  return error;
}

export class MemoryDb {
  readonly schema: StoreSchema;
  private readonly columns: Record<string, Set<string>>;
  private readonly rows: Record<string, Row[]>;
  readonly rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  failWhen: FailWhen | null = null;

  constructor(schema: StoreSchema = loadStoreSchema()) {
    this.schema = schema;
    this.columns = Object.fromEntries(
      Object.entries(schema.tables).map(([table, cols]) => [table, new Set(cols)])
    );
    this.rows = Object.fromEntries(Object.keys(schema.tables).map((table) => [table, []]));
  }

  rowsOf(table: string) {
    return this.requireTable(table);
  }

  seed(table: string, rows: Row[]) {
    const stored = this.requireTable(table);
    for (const row of rows) {
      this.assertKnownColumns(table, row);
      if (
        table === "orders" &&
        row.status != null &&
        !this.schema.orderStatuses.includes(String(row.status))
      ) {
        throw dbError(
          `new row for relation "orders" violates check constraint "orders_status_check"`,
          "23514"
        );
      }
      stored.push({ ...row });
    }
  }

  from(table: string) {
    return new Query(this, table);
  }

  async rpc(fn: string, args: Record<string, unknown> = {}) {
    this.rpcCalls.push({ fn, args });
    try {
      if (fn === "reserve_order_inventory") {
        return { data: this.reserveOrder(args), error: null };
      }
      if (fn === "restore_order_inventory") {
        return { data: this.restoreOrder(args), error: null };
      }
      if (fn === "reserve_inventory") {
        this.applyStock(asItems(args.order_items), -1);
        return { data: [{ success: true, message: "Stock reserved" }], error: null };
      }
      if (fn === "restore_inventory") {
        this.applyStock(asItems(args.order_items), 1);
        return { data: [{ success: true, message: "Stock restored" }], error: null };
      }
      return {
        data: null,
        error: dbError(`function ${fn} does not exist`, "42883"),
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? (error as DbError) : dbError(String(error)),
      };
    }
  }

  requireTable(table: string) {
    const rows = this.rows[table];
    if (!rows || !this.columns[table]) {
      throw dbError(`relation "${table}" does not exist`, "42P01");
    }
    return rows;
  }

  assertKnownColumns(table: string, record: Row) {
    const columns = this.columns[table];
    for (const key of Object.keys(record)) {
      if (!columns.has(key)) {
        throw dbError(`column ${table}.${key} does not exist`, "42703");
      }
    }
  }

  private reserveOrder(args: Record<string, unknown>) {
    const order = this.orderForUpdate(args.p_order_id);
    if (!order) throw dbError("Order not found while reserving inventory");
    if (order.inventory_reserved === true) {
      return [{ success: true, already_reserved: true, message: "Inventory already reserved" }];
    }
    this.applyStock(asItems(args.order_items), -1);
    order.inventory_reserved = true;
    return [{ success: true, already_reserved: false, message: "Inventory reserved" }];
  }

  private restoreOrder(args: Record<string, unknown>) {
    const order = this.orderForUpdate(args.p_order_id);
    if (!order) throw dbError("Order not found while restoring inventory");
    // Mirrors restore_order_inventory: payment_status is read under the order lock.
    if (order.payment_status === "succeeded") {
      return [
        {
          success: false,
          was_reserved: order.inventory_reserved === true,
          message: "Order is paid; inventory not restored",
        },
      ];
    }
    if (order.inventory_reserved !== true) {
      return [{ success: true, was_reserved: false, message: "Inventory already restored" }];
    }
    this.applyStock(asItems(args.order_items), 1);
    order.inventory_reserved = false;
    return [{ success: true, was_reserved: true, message: "Inventory restored" }];
  }

  private orderForUpdate(orderId: unknown) {
    return this.rows.orders.find((row) => row.id === orderId);
  }

  private applyStock(items: StockItem[], direction: -1 | 1) {
    const products = this.rows.products ?? [];
    const variants = this.rows.product_variants ?? [];

    for (const item of items) {
      if (item.variant_id) {
        const variant = variants.find((row) => row.id === item.variant_id);
        if (!variant) throw dbError("Variant not found while adjusting inventory");
        const next = Number(variant.stock_count) + direction * item.quantity;
        if (direction < 0 && (variant.stock_count == null || next < 0)) {
          throw dbError("Variant stock unavailable");
        }
      } else {
        const product = products.find((row) => row.id === item.product_id);
        if (!product) throw dbError("Product not found while adjusting inventory");
        const next = Number(product.stock_count) + direction * item.quantity;
        if (direction < 0 && (product.stock_count == null || next < 0)) {
          throw dbError("Product stock unavailable");
        }
      }
    }

    const touchedProducts = new Set<string>();
    for (const item of items) {
      if (item.variant_id) {
        const variant = variants.find((row) => row.id === item.variant_id);
        if (!variant) continue;
        variant.stock_count = Number(variant.stock_count) + direction * item.quantity;
        touchedProducts.add(String(item.product_id));
      } else {
        const product = products.find((row) => row.id === item.product_id);
        if (!product) continue;
        const next = Number(product.stock_count) + direction * item.quantity;
        product.stock_count = next;
        product.in_stock = next > 0;
      }
    }

    for (const productId of touchedProducts) {
      const total = variants
        .filter((row) => row.product_id === productId)
        .reduce((sum, row) => sum + Number(row.stock_count ?? 0), 0);
      const product = products.find((row) => row.id === productId);
      if (!product) continue;
      product.stock_count = total;
      product.in_stock = total > 0;
    }
  }
}

interface StockItem {
  product_id: string;
  variant_id: string | null;
  quantity: number;
}

function asItems(value: unknown): StockItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      return {
        product_id: String(row.product_id ?? ""),
        variant_id: row.variant_id ? String(row.variant_id) : null,
        quantity: Math.max(0, Math.floor(Number(row.quantity) || 0)),
      };
    })
    .filter((item) => item.quantity > 0 && item.product_id);
}

interface SelectField {
  name: string;
  nested: string | null;
}

class Query implements PromiseLike<QueryResult> {
  private operation: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private selectList = "*";
  private payload: Row | Row[] | null = null;
  private onConflict: string[] = [];
  private filters: QueryFilter[] = [];
  private limitN: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private head = false;
  private counted = false;

  constructor(
    private readonly db: MemoryDb,
    private readonly table: string
  ) {}

  select(columns: string, options?: { count?: string; head?: boolean }) {
    this.selectList = columns;
    this.head = Boolean(options?.head);
    this.counted = options?.count === "exact";
    return this;
  }

  insert(payload: Row | Row[]) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Row) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload: Row, options?: { onConflict?: string }) {
    this.operation = "upsert";
    this.payload = payload;
    this.onConflict = (options?.onConflict ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ op: "eq", column, value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ op: "neq", column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ op: "in", column, value });
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push({ op: "lt", column, value });
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ op: "is", column, value });
    return this;
  }

  limit(count: number) {
    this.limitN = count;
    return this;
  }

  single() {
    this.mode = "single";
    return this;
  }

  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<QueryResult> {
    try {
      const injected = this.db.failWhen?.(this.table, this.operation, this.filters);
      if (injected) return { data: null, error: injected, count: null };
      if (this.operation === "select") return this.runSelect();
      if (this.operation === "insert") return this.runInsert();
      if (this.operation === "update") return this.runUpdate();
      if (this.operation === "upsert") return this.runUpsert();
      return this.runDelete();
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? (error as DbError) : dbError(String(error)),
        count: null,
      };
    }
  }

  private runSelect(): QueryResult {
    const fields = parseSelect(this.selectList);
    this.assertFields(fields);
    let rows = this.db.requireTable(this.table).filter((row) => matches(row, this.filters));
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    const count = this.counted ? rows.length : null;
    if (this.head) return { data: null, error: null, count };
    return this.finish(rows.map((row) => this.project(row, fields)), count);
  }

  private runInsert(): QueryResult {
    const incoming = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
    const stored = this.db.requireTable(this.table);
    const inserted: Row[] = [];
    for (const row of incoming) {
      this.db.assertKnownColumns(this.table, row);
      this.assertStatus(row.status);
      this.assertUnique(row, null);
      const next = this.withDefaults(row);
      stored.push(next);
      inserted.push(next);
    }
    if (this.selectList === "*" && this.operation === "insert" && this.mode === "many" && !this.counted) {
      // Insert without a following select still records rows. Callers only read `error`.
    }
    if (!this.selected()) return { data: null, error: null, count: null };
    const fields = parseSelect(this.selectList);
    this.assertFields(fields);
    return this.finish(inserted.map((row) => this.project(row, fields)), inserted.length);
  }

  private runUpdate(): QueryResult {
    const patch = (this.payload ?? {}) as Row;
    this.db.assertKnownColumns(this.table, patch);
    const rows = this.db.requireTable(this.table).filter((row) => matches(row, this.filters));
    for (const row of rows) {
      const nextStatus = Object.prototype.hasOwnProperty.call(patch, "status") ? patch.status : row.status;
      this.assertStatus(nextStatus);
      Object.assign(row, patch);
    }
    if (!this.selected()) return { data: null, error: null, count: rows.length };
    const fields = parseSelect(this.selectList);
    this.assertFields(fields);
    return this.finish(rows.map((row) => this.project(row, fields)), rows.length);
  }

  private runUpsert(): QueryResult {
    const patch = { ...((this.payload ?? {}) as Row) };
    this.db.assertKnownColumns(this.table, patch);
    this.assertStatus(patch.status);
    const stored = this.db.requireTable(this.table);
    const existing = stored.find((row) =>
      this.onConflict.every((column) => row[column] === patch[column])
    );
    let saved: Row;
    if (existing) {
      Object.assign(existing, patch);
      saved = existing;
    } else {
      this.assertUnique(patch, null);
      saved = this.withDefaults(patch);
      stored.push(saved);
    }
    if (!this.selected()) return { data: saved, error: null, count: 1 };
    const fields = parseSelect(this.selectList);
    this.assertFields(fields);
    return this.finish([this.project(saved, fields)], 1);
  }

  private runDelete(): QueryResult {
    const stored = this.db.requireTable(this.table);
    const kept = stored.filter((row) => !matches(row, this.filters));
    const removed = stored.length - kept.length;
    stored.splice(0, stored.length, ...kept);
    return { data: null, error: null, count: removed };
  }

  private selected() {
    return this.selectList !== "*" || this.mode !== "many";
  }

  private finish(rows: Row[], count: number | null): QueryResult {
    if (this.mode === "many") return { data: rows, error: null, count };
    if (rows.length !== 1) {
      if (this.mode === "maybe") return { data: null, error: null, count };
      return {
        data: null,
        error: dbError("JSON object requested, multiple (or no) rows returned", "PGRST116"),
        count,
      };
    }
    return { data: rows[0], error: null, count };
  }

  private assertFields(fields: SelectField[]) {
    const columns = this.db.schema.tables[this.table];
    if (!columns) throw dbError(`relation "${this.table}" does not exist`, "42P01");
    for (const field of fields) {
      if (field.nested) {
        const childColumns = this.db.schema.tables[field.name];
        if (!childColumns) {
          throw dbError(`relation "${field.name}" does not exist`, "42P01");
        }
        for (const child of parseSelect(field.nested)) {
          if (!childColumns.includes(child.name)) {
            throw dbError(`column ${field.name}.${child.name} does not exist`, "42703");
          }
        }
        continue;
      }
      if (field.name !== "*" && !columns.includes(field.name)) {
        throw dbError(`column ${this.table}.${field.name} does not exist`, "42703");
      }
    }
  }

  private project(row: Row, fields: SelectField[]) {
    if (fields.length === 1 && fields[0].name === "*" && !fields[0].nested) return { ...row };
    const projected: Row = {};
    for (const field of fields) {
      if (field.nested) {
        projected[field.name] = this.embed(row, field);
        continue;
      }
      projected[field.name] = row[field.name];
    }
    return projected;
  }

  private embed(row: Row, field: SelectField) {
    const fk =
      this.table === "products" && field.name === "product_variants"
        ? "product_id"
        : ORDER_FK[field.name];
    const children = (this.db.rowsOf(field.name) ?? []).filter((child) => child[fk] === row.id);
    const nestedFields = parseSelect(field.nested ?? "*");
    return children.map((child) => {
      if (nestedFields.length === 1 && nestedFields[0].name === "*") return { ...child };
      const projected: Row = {};
      for (const nested of nestedFields) projected[nested.name] = child[nested.name];
      return projected;
    });
  }

  private assertStatus(status: unknown) {
    if (this.table !== "orders" || status == null) return;
    if (!this.db.schema.orderStatuses.includes(String(status))) {
      throw dbError(
        `new row for relation "orders" violates check constraint "orders_status_check"`,
        "23514"
      );
    }
  }

  private assertUnique(row: Row, ignore: Row | null) {
    const stored = this.db.requireTable(this.table).filter((candidate) => candidate !== ignore);
    if (this.table === "orders" && row.stripe_session_id) {
      if (stored.some((candidate) => candidate.stripe_session_id === row.stripe_session_id)) {
        throw dbError("duplicate key value violates unique constraint", "23505");
      }
    }
    if (this.table === "payments") {
      if (
        stored.some(
          (candidate) =>
            candidate.provider === row.provider &&
            candidate.provider_payment_intent_id === row.provider_payment_intent_id
        )
      ) {
        throw dbError("duplicate key value violates unique constraint", "23505");
      }
    }
    if (this.table === "payment_webhook_events") {
      if (
        stored.some(
          (candidate) =>
            candidate.provider === row.provider &&
            candidate.provider_event_id === row.provider_event_id
        )
      ) {
        throw dbError("duplicate key value violates unique constraint", "23505");
      }
    }
  }

  private withDefaults(row: Row) {
    const next: Row = { ...row };
    if (next.id == null) next.id = crypto.randomUUID();
    const columns = this.db.schema.tables[this.table] ?? [];
    const now = new Date().toISOString();
    if (columns.includes("created_at") && next.created_at == null) next.created_at = now;
    if (columns.includes("updated_at") && next.updated_at == null) next.updated_at = now;
    if (this.table === "orders") {
      if (next.inventory_reserved == null) next.inventory_reserved = false;
      if (next.verification_completed == null) next.verification_completed = false;
      if (next.status == null) next.status = "pending";
    }
    return next;
  }
}

function parseSelect(input: string): SelectField[] {
  if (!input || input.trim() === "*") return [{ name: "*", nested: null }];
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of input) {
    if (ch === "(") depth += 1;
    if (ch === ")" && depth > 0) depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.map((part) => {
    const nested = part.match(/^([a-z_][a-z0-9_]*)\((.*)\)$/i);
    if (nested) return { name: nested[1], nested: nested[2] };
    return { name: part, nested: null };
  });
}

function matches(row: Row, filters: QueryFilter[]) {
  return filters.every((filter) => {
    const value = row[filter.column];
    if (filter.op === "eq") return value === filter.value;
    if (filter.op === "neq") return value !== filter.value;
    if (filter.op === "in") return Array.isArray(filter.value) && filter.value.includes(value);
    if (filter.op === "is") return value === filter.value || (filter.value === null && value == null);
    if (filter.op === "lt") return String(value ?? "") < String(filter.value ?? "");
    return false;
  });
}

export function createCheckoutDb() {
  const db = new MemoryDb();
  db.seed("products", [
    {
      id: "prod-amethyst",
      slug: "amethyst-bracelet-xv",
      name: "Amethyst Bracelet XV (5mm)",
      price: 100,
      stock_count: 5,
      in_stock: true,
      low_stock_threshold: 5,
      sku: "JQJ-AMETH-XV",
    },
  ]);
  return db;
}

export const checkoutCustomer = {
  email: "buyer@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
  address: "1 Atelier Lane",
  apartment: "",
  city: "Austin",
  region: "TX",
  country: "United States",
  phone: "555-0100",
};

export function checkoutItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "prod-amethyst",
    slug: "amethyst-bracelet-xv",
    name: "Amethyst Bracelet XV (5mm)",
    price: 1,
    quantity: 1,
    ...overrides,
  };
}
