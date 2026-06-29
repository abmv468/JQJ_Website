"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Settings,
  RefreshCw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/utils";
import {
  formatOrderStatusLabel,
  getOrderStatusOptions,
  hasPartialRefund,
  isFullyRefunded,
} from "@/lib/order-lifecycle";

type Tab = "dashboard" | "products" | "orders" | "customers" | "settings";

interface AdminProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  sku: string | null;
  low_stock_threshold: number;
  stock_count: number;
  in_stock: boolean;
  product_variants?: Array<{
    id: string;
    size: string | null;
    material: string | null;
    sku: string;
    stock_count: number;
  }>;
  categories?: { name: string } | null;
}

interface AdminOrder {
  id: string;
  status: string;
  total_amount: number;
  refunded_amount: number | null;
  customer_email: string | null;
  customer_name: string | null;
  created_at: string;
  shipping_address?: { payment_method?: string } | null;
  order_refunds?: { id: string; amount: number; reason: string | null; created_at: string }[];
}

const navItems: { key: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "products", label: "Products", icon: Package },
  { key: "orders", label: "Orders", icon: ShoppingCart },
  { key: "customers", label: "Customers", icon: Users },
  { key: "settings", label: "Settings", icon: Settings },
];

export default function AdminPage() {
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [stockForm, setStockForm] = useState({
    sku: "",
    stock_count: "0",
    low_stock_threshold: "5",
    in_stock: true,
    variantsJson: "[]",
  });
  const [productError, setProductError] = useState<string | null>(null);
  const [refundDrafts, setRefundDrafts] = useState<Record<string, { amount: string; reason: string }>>({});

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthChecked(true);
    });
  }, []);

  const getAdminAuthHeaders = useCallback(async (withJsonContentType = false) => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return null;

    return {
      Authorization: `Bearer ${token}`,
      ...(withJsonContentType ? { "Content-Type": "application/json" } : {}),
    };
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const orderHeaders = await getAdminAuthHeaders();
      if (!orderHeaders) {
        setIsAdmin(false);
        return;
      }

      const [productsResponse, ordersResponse] = await Promise.all([
        fetch("/api/admin/products", {
          headers: orderHeaders ?? undefined,
        }),
        fetch("/api/admin/orders", {
          headers: orderHeaders,
        }),
      ]);

      if (productsResponse.status === 401 || productsResponse.status === 403) {
        setIsAdmin(false);
        return;
      }

      if (ordersResponse.status === 401 || ordersResponse.status === 403) {
        setIsAdmin(false);
        return;
      }

      if (!productsResponse.ok || !ordersResponse.ok) {
        throw new Error("Failed to load admin data");
      }

      const [p, o] = await Promise.all([productsResponse.json(), ordersResponse.json()]);
      setIsAdmin(true);
      setProducts(p.products ?? []);
      setOrders(o.orders ?? []);
    } catch {
      setIsAdmin(false);
      // surfaced as empty states below
    } finally {
      setLoading(false);
    }
  }, [getAdminAuthHeaders]);

  useEffect(() => {
    if (!authChecked) return;
    if (!user) {
      setIsAdmin(false);
      return;
    }

    void loadData();
  }, [authChecked, loadData, user]);

  async function updateOrderStatus(id: string, status: string) {
    const headers = await getAdminAuthHeaders(true);
    if (!headers) return;

    const response = await fetch("/api/admin/orders", {
      method: "PUT",
      headers,
      body: JSON.stringify({ id, status }),
    });
    if (!response.ok) return;
    const payload = await response.json();
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...payload.order } : o)));
  }

  async function createPartialRefund(order: AdminOrder) {
    const draft = refundDrafts[order.id];
    const amount = Number(draft?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    const headers = await getAdminAuthHeaders(true);
    if (!headers) return;

    const response = await fetch("/api/admin/orders", {
      method: "POST",
      headers,
      body: JSON.stringify({ id: order.id, amount, reason: draft?.reason ?? "" }),
    });

    if (!response.ok) return;

    const payload = await response.json();
    setOrders((prev) => prev.map((o) => (o.id === order.id ? payload.order : o)));
    setRefundDrafts((prev) => ({ ...prev, [order.id]: { amount: "", reason: "" } }));
  }

  function startEditingProduct(product: AdminProduct) {
    setEditingProductId(product.id);
    setProductError(null);
    setStockForm({
      sku: product.sku ?? "",
      stock_count: String(product.stock_count ?? 0),
      low_stock_threshold: String(product.low_stock_threshold ?? 5),
      in_stock: product.in_stock,
      variantsJson: JSON.stringify(
        (product.product_variants ?? []).map((variant) => ({
          size: variant.size ?? "",
          material: variant.material ?? "",
          sku: variant.sku,
          stock_count: variant.stock_count,
        })),
        null,
        2
      ),
    });
  }

  async function saveProductInventory() {
    if (!editingProductId) return;
    setProductError(null);
    try {
      const headers = await getAdminAuthHeaders(true);
      if (!headers) {
        setIsAdmin(false);
        return;
      }

      const parsedVariants = JSON.parse(stockForm.variantsJson);
      if (!Array.isArray(parsedVariants)) {
        throw new Error("Variants must be a JSON array.");
      }
      const cleanedVariants = parsedVariants
        .map((variant) => ({
          size: variant.size || null,
          material: variant.material || null,
          sku: String(variant.sku || "").trim(),
          stock_count: Number(variant.stock_count || 0),
        }))
        .filter((variant) => variant.sku);

      const res = await fetch("/api/admin/products", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          id: editingProductId,
          sku: stockForm.sku || null,
          stock_count: Number(stockForm.stock_count || 0),
          low_stock_threshold: Number(stockForm.low_stock_threshold || 5),
          in_stock: stockForm.in_stock,
          variants: cleanedVariants,
        }),
      });
      if (res.status === 401 || res.status === 403) {
        setIsAdmin(false);
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save product");

      setProducts((prev) =>
        prev.map((product) => (product.id === editingProductId ? data.product : product))
      );
      setEditingProductId(null);
    } catch (err) {
      setProductError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  if (!authChecked) {
    return <div className="flex h-screen items-center justify-center text-brand-muted">Loading…</div>;
  }

  if (user && isAdmin === null) {
    return <div className="flex h-screen items-center justify-center text-brand-muted">Loading…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 text-center">
        <h1 className="font-heading text-2xl uppercase tracking-wider2">Access denied</h1>
        <p className="text-sm text-brand-muted">
          {user ? `${user.email} is not an admin.` : "Please sign in with an admin account."}
        </p>
        <a href="/auth/login" className="btn-gold">Sign In</a>
      </div>
    );
  }

  const revenue = orders.reduce((s, o) => s + Number(o.total_amount), 0);
  const lowStock = products.filter((p) => p.stock_count <= 5);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="w-full shrink-0 border-b border-brand-border bg-brand-surface p-4 lg:w-56 lg:border-b-0 lg:border-r lg:p-5">
        <div className="mb-4 font-heading text-sm uppercase tracking-wider2 text-brand-gold lg:mb-8">
          JQD Admin
        </div>
        <nav className="flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2 text-xs sm:text-sm lg:w-full lg:gap-3 ${
                  tab === item.key ? "bg-brand-card text-white" : "text-brand-muted hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" /> {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 lg:mb-8">
          <h1 className="font-heading text-xl uppercase tracking-wider2 capitalize">{tab}</h1>
          <button type="button" onClick={loadData} className="btn-secondary flex items-center gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {tab === "dashboard" && (
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            <Stat label="Products" value={String(products.length)} />
            <Stat label="Orders" value={String(orders.length)} />
            <Stat label="Revenue" value={formatPrice(revenue)} />
            <Stat label="Low Stock" value={String(lowStock.length)} />
            <div className="col-span-2 border border-brand-border p-5 md:col-span-4">
              <h2 className="mb-3 font-heading text-sm uppercase tracking-wider2">Low Stock Alerts</h2>
              {lowStock.length === 0 ? (
                <p className="text-sm text-brand-muted">All products well stocked.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {lowStock.map((p) => (
                    <li key={p.id} className="flex justify-between">
                      <span>{p.name}</span>
                      <span className="text-brand-gold">{p.stock_count} left</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {tab === "products" && (
          <div className="space-y-5">
            <div className="overflow-x-auto border border-brand-border">
              <table className="min-w-[760px] w-full text-left text-sm">
                <thead className="border-b border-brand-border text-xs uppercase tracking-wider2 text-brand-muted">
                  <tr>
                    <th className="p-3">Name</th>
                    <th className="p-3">SKU</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Price</th>
                    <th className="p-3">Stock</th>
                    <th className="p-3">Variants</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-brand-muted">
                        No products. Add the seed data in Supabase to populate this table.
                      </td>
                    </tr>
                  ) : (
                    products.map((product) => (
                      <tr key={product.id} className="border-b border-brand-border/60">
                        <td className="p-3">{product.name}</td>
                        <td className="p-3 font-mono text-xs">{product.sku || "—"}</td>
                        <td className="p-3">{product.categories?.name ?? "—"}</td>
                        <td className="p-3">{formatPrice(Number(product.price))}</td>
                        <td className="p-3">
                          {!product.in_stock ? (
                            <span className="text-red-400">Out ({product.stock_count})</span>
                          ) : product.stock_count <= (product.low_stock_threshold ?? 5) ? (
                            <span className="text-brand-gold">Low ({product.stock_count})</span>
                          ) : (
                            <span>{product.stock_count}</span>
                          )}
                        </td>
                        <td className="p-3">{product.product_variants?.length ?? 0}</td>
                        <td className="p-3">
                          <button
                            type="button"
                            className="btn-secondary px-3 py-1 text-xs"
                            onClick={() => startEditingProduct(product)}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {editingProductId && (
              <div className="space-y-4 border border-brand-border p-5">
                <h3 className="font-heading text-sm uppercase tracking-wider2">
                  Edit Inventory & Variants
                </h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-xs text-brand-muted">
                    Product SKU
                    <input
                      value={stockForm.sku}
                      onChange={(e) =>
                        setStockForm((prev) => ({ ...prev, sku: e.target.value }))
                      }
                      className="input-field"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-brand-muted">
                    Base stock count
                    <input
                      type="number"
                      min={0}
                      value={stockForm.stock_count}
                      onChange={(e) =>
                        setStockForm((prev) => ({ ...prev, stock_count: e.target.value }))
                      }
                      className="input-field"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-brand-muted">
                    Low stock threshold
                    <input
                      type="number"
                      min={1}
                      value={stockForm.low_stock_threshold}
                      onChange={(e) =>
                        setStockForm((prev) => ({
                          ...prev,
                          low_stock_threshold: e.target.value,
                        }))
                      }
                      className="input-field"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-brand-muted">
                    <input
                      type="checkbox"
                      checked={stockForm.in_stock}
                      onChange={(e) =>
                        setStockForm((prev) => ({ ...prev, in_stock: e.target.checked }))
                      }
                    />
                    In stock
                  </label>
                </div>
                <label className="space-y-1 text-xs text-brand-muted">
                  Variants JSON (size/material/sku/stock_count)
                  <textarea
                    rows={8}
                    value={stockForm.variantsJson}
                    onChange={(e) =>
                      setStockForm((prev) => ({ ...prev, variantsJson: e.target.value }))
                    }
                    className="input-field font-mono text-xs"
                  />
                </label>
                {productError && <p className="text-xs text-red-400">{productError}</p>}
                <div className="flex flex-wrap gap-3">
                  <button type="button" className="btn-gold" onClick={saveProductInventory}>
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setEditingProductId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "orders" && (
          <div className="overflow-x-auto border border-brand-border">
            <table className="min-w-[860px] w-full text-left text-sm">
              <thead className="border-b border-brand-border text-xs uppercase tracking-wider2 text-brand-muted">
                <tr>
                  <th className="p-3">Order</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Method</th>
                  <th className="p-3">Total</th>
                  <th className="p-3">Refunded</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Refund Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-brand-muted">No orders yet.</td>
                  </tr>
                ) : (
                  orders.map((o) => (
                    <tr key={o.id} className="border-b border-brand-border/60">
                      {(() => {
                        const totalAmount = Number(o.total_amount || 0);
                        const refundedAmount = Number(o.refunded_amount || 0);
                        const partialRefund = hasPartialRefund(totalAmount, refundedAmount);
                        const fullyRefunded = isFullyRefunded(totalAmount, refundedAmount);
                        const statusLabel = formatOrderStatusLabel(o.status);
                        const statusOptions = getOrderStatusOptions(o.status);
                        const currentSelectValue =
                          statusOptions.find((statusOption) => statusOption === o.status) ??
                          statusOptions[0];
                        const canRefund = !fullyRefunded;
                        const remainingToRefund = Math.max(totalAmount - refundedAmount, 0);

                        return (
                          <>
                      <td className="p-3 font-mono text-xs">{o.id.slice(0, 8)}</td>
                      <td className="p-3">{o.customer_name || o.customer_email || "Guest"}</td>
                      <td className="p-3 uppercase text-brand-muted">
                        {o.shipping_address?.payment_method ?? "—"}
                      </td>
                      <td className="p-3 text-brand-gold">{formatPrice(Number(o.total_amount))}</td>
                      <td className="p-3">
                        {refundedAmount <= 0 ? (
                          <span className="text-brand-muted">—</span>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-xs text-brand-gold">
                              {formatPrice(refundedAmount)}
                              {partialRefund && (
                                <span className="ml-1 text-brand-muted">
                                  / {formatPrice(totalAmount)} (partial)
                                </span>
                              )}
                            </p>
                            {!!o.order_refunds?.length && (
                              <ul className="space-y-1 text-[11px] text-brand-muted">
                                {[...o.order_refunds]
                                  .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
                                  .slice(0, 3)
                                  .map((refund) => (
                                    <li key={refund.id}>
                                      {formatPrice(Number(refund.amount))}
                                      {refund.reason ? ` · ${refund.reason}` : ""}
                                    </li>
                                  ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <select
                          value={currentSelectValue}
                          onChange={(e) => updateOrderStatus(o.id, e.target.value)}
                          className="border border-brand-border bg-transparent px-2 py-1 text-xs"
                          disabled={fullyRefunded}
                        >
                          {statusOptions.map((s) => (
                            <option key={s} value={s} className="bg-brand-surface capitalize">
                              {formatOrderStatusLabel(s)}
                            </option>
                          ))}
                        </select>
                        {partialRefund && (
                          <p className="mt-1 text-[11px] text-brand-muted">
                            {statusLabel} (partial refund)
                          </p>
                        )}
                      </td>
                      <td className="p-3">
                        {canRefund ? (
                          <div className="space-y-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              max={remainingToRefund}
                              placeholder="Amount"
                              value={refundDrafts[o.id]?.amount ?? ""}
                              onChange={(e) =>
                                setRefundDrafts((prev) => ({
                                  ...prev,
                                  [o.id]: { amount: e.target.value, reason: prev[o.id]?.reason ?? "" },
                                }))
                              }
                              className="w-full min-w-0 border border-brand-border bg-transparent px-2 py-1 text-xs sm:w-24"
                            />
                            <input
                              type="text"
                              placeholder="Reason (optional)"
                              value={refundDrafts[o.id]?.reason ?? ""}
                              onChange={(e) =>
                                setRefundDrafts((prev) => ({
                                  ...prev,
                                  [o.id]: { amount: prev[o.id]?.amount ?? "", reason: e.target.value },
                                }))
                              }
                              className="w-full min-w-28 border border-brand-border bg-transparent px-2 py-1 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => createPartialRefund(o)}
                              className="btn-secondary px-2 py-1 text-[11px]"
                            >
                              Refund
                            </button>
                            <p className="text-[11px] text-brand-muted">
                              Remaining: {formatPrice(remainingToRefund)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-brand-muted">Fully refunded</span>
                        )}
                      </td>
                          </>
                        );
                      })()}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "customers" && (
          <Table
            head={["Customer", "Email", "Orders"]}
            rows={Object.values(
              orders.reduce<Record<string, [string, string, number]>>((acc, o) => {
                const key = o.customer_email || "guest";
                if (!acc[key]) acc[key] = [o.customer_name || "Guest", o.customer_email || "—", 0];
                acc[key][2] += 1;
                return acc;
              }, {})
            ).map((r) => [r[0], r[1], String(r[2])])}
            empty="No customers yet."
          />
        )}

        {tab === "settings" && (
          <div className="max-w-lg space-y-4 border border-brand-border p-6 text-sm">
            <Row label="Admin Email" value={adminEmail ?? "Not set"} />
            <Row label="Store Name" value="JQD Group" />
            <Row label="Currency" value="User selectable (USD/EUR/GBP/CAD/AUD)" />
            <Row label="COD Fee" value={formatPrice(20)} />
            <Row label="Flat Shipping" value={formatPrice(15)} />
            <p className="pt-2 text-xs text-brand-muted">
              Configure payment keys and email in <code>.env.local</code>.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-brand-border p-5">
      <p className="text-xs uppercase tracking-wider2 text-brand-muted">{label}</p>
      <p className="mt-2 font-heading text-2xl text-white">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-brand-border/60 pb-2">
      <span className="text-brand-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Table({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: string[][];
  empty: string;
}) {
  return (
    <div className="overflow-x-auto border border-brand-border">
      <table className="min-w-[520px] w-full text-left text-sm">
        <thead className="border-b border-brand-border text-xs uppercase tracking-wider2 text-brand-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="p-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="p-6 text-center text-brand-muted">{empty}</td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} className="border-b border-brand-border/60">
                {r.map((cell, j) => (
                  <td key={j} className="p-3">{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
