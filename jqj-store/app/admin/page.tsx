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
  price: number;
  stock_count: number;
  in_stock: boolean;
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
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [refundDrafts, setRefundDrafts] = useState<Record<string, { amount: string; reason: string }>>({});

  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

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
      const [p, o] = await Promise.all([
        fetch("/api/admin/products").then((r) => r.json()),
        fetch("/api/admin/orders", {
          headers: orderHeaders ?? undefined,
        }).then((r) => r.json()),
      ]);
      setProducts(p.products ?? []);
      setOrders(o.orders ?? []);
    } catch {
      // surfaced as empty states below
    } finally {
      setLoading(false);
    }
  }, [getAdminAuthHeaders]);

  const isAdmin = user?.email && adminEmail && user.email === adminEmail;

  useEffect(() => {
    if (isAdmin) loadData();
  }, [isAdmin, loadData]);

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

  if (!authChecked) {
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
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-brand-border bg-brand-surface p-5">
        <div className="mb-8 font-heading text-sm uppercase tracking-wider2 text-brand-gold">
          JQJ Admin
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-sm ${
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
      <main className="flex-1 p-8">
        <div className="mb-8 flex items-center justify-between">
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
          <Table
            head={["Name", "Category", "Price", "Stock"]}
            rows={products.map((p) => [
              p.name,
              p.categories?.name ?? "—",
              formatPrice(Number(p.price)),
              String(p.stock_count),
            ])}
            empty="No products. Add the seed data in Supabase to populate this table."
          />
        )}

        {tab === "orders" && (
          <div className="overflow-x-auto border border-brand-border">
            <table className="w-full text-left text-sm">
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
                              className="w-24 border border-brand-border bg-transparent px-2 py-1 text-xs"
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
            <Row label="Store Name" value="JQJ Group" />
            <Row label="Currency" value="USD ($)" />
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
      <table className="w-full text-left text-sm">
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
