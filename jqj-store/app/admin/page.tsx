"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { loadAdminSettingsFacts } from "./settings-action";
import type { AdminSettingsFacts } from "@/lib/admin/settings-facts";
import { AIRWALLEX_SETTINGS_NOTE, HIDDEN_ON_SERVER } from "@/lib/admin/settings-facts";
import {
  formatCheckoutAddress,
  orderLines,
  paymentMethodLabel,
  settledRefundedAmount,
  sumOrderRevenue,
  type CheckoutAddress,
} from "@/lib/admin/order-view";
import {
  interpretRefundAttempt,
  orderAfterRefundAttempt,
  orderDisplayId,
  prepareRefundSubmit,
  refundConfirmPrompt,
  remainingAfterThisRefund,
  remainingToRefund,
} from "@/lib/admin/refund-panel";
import { BRAND_EN, BRAND_MARK, BRAND_ZH, LEGAL_ENTITY } from "@/lib/auth/brand";
import {
  formatOrderStatusLabel,
  getAdminOrderStatusPresentation,
  getOrderStatusOptions,
  isFullyRefunded,
  isSucceededPaymentStatus,
} from "@/lib/order-lifecycle";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/utils";

type Tab = "dashboard" | "products" | "orders" | "customers" | "settings";

interface VariantDraft {
  key: string;
  size: string;
  material: string;
  sku: string;
  stock_count: string;
}

let variantSeq = 0;

function nextVariantKey() {
  variantSeq += 1;
  return `variant-${variantSeq}`;
}

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
  fulfillment_status?: string | null;
  payment_status?: string | null;
  payment_provider?: string | null;
  currency?: string | null;
  total_amount: number;
  refunded_amount: number | null;
  customer_email: string | null;
  customer_name: string | null;
  created_at: string;
  shipping_address?: CheckoutAddress | null;
  order_items?: Array<{
    id: string;
    product_name: string | null;
    sku: string | null;
    quantity: number;
    price_at_purchase: number;
  }>;
  order_refunds?: { id: string; amount: number; reason: string | null; created_at: string }[];
  payments?: Array<{
    id: string;
    provider: string;
    provider_payment_intent_id: string;
    status: string;
    currency: string | null;
    payment_refunds?: Array<{
      id: string;
      provider_refund_id: string;
      amount: number;
      status: string;
      reason: string | null;
      created_at: string;
    }>;
  }>;
}

type RefundDraft = {
  amount: string;
  reason: string;
  confirming: boolean;
  fieldError: string | null;
  notice: string | null;
  noticeTone: "partial" | "full" | "failed" | "pending" | "rejected" | null;
};

const navItems: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "products", label: "Products" },
  { key: "orders", label: "Orders" },
  { key: "customers", label: "Customers" },
  { key: "settings", label: "Settings" },
];

const tabTitle: Record<Tab, string> = {
  dashboard: "Dashboard",
  products: "Products",
  orders: "Orders",
  customers: "Customers",
  settings: "Settings",
};

function emptyDraft(): RefundDraft {
  return {
    amount: "",
    reason: "",
    confirming: false,
    fieldError: null,
    notice: null,
    noticeTone: null,
  };
}

function primaryPayment(order: AdminOrder) {
  return (
    (order.payments ?? []).find((payment) => payment.provider === "airwallex") ??
    (order.payments ?? [])[0]
  );
}

function orderFigures(order: AdminOrder) {
  const total = Number(order.total_amount || 0);
  const payment = primaryPayment(order);
  const settled = settledRefundedAmount({
    refundedAmount: Number(order.refunded_amount || 0),
    providerRefunds: payment?.payment_refunds,
  });
  return {
    total,
    settled,
    remaining: remainingToRefund(total, settled),
    payment,
  };
}

export default function AdminPage() {
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
    variants: [] as VariantDraft[],
  });
  const [productError, setProductError] = useState<string | null>(null);
  const [refundDrafts, setRefundDrafts] = useState<Record<string, RefundDraft>>({});
  const [orderActionError, setOrderActionError] = useState<string | null>(null);
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AdminSettingsFacts | null>(null);
  const [settingsState, setSettingsState] = useState<"idle" | "ready" | "hidden">("idle");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthChecked(true);
    }).catch(() => {
      setUser(null);
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
        setSettingsState("hidden");
        return;
      }

      const token = orderHeaders.Authorization.replace(/^Bearer\s+/i, "");
      const [productsResponse, ordersResponse, settingsResult] = await Promise.all([
        fetch("/api/admin/products", {
          headers: orderHeaders,
        }),
        fetch("/api/admin/orders", {
          headers: orderHeaders,
        }),
        loadAdminSettingsFacts(token).catch(() => ({ ok: false as const })),
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
      if (settingsResult.ok) {
        setSettings(settingsResult.facts);
        setSettingsState("ready");
      } else {
        setSettingsState("hidden");
      }
    } catch {
      setIsAdmin(false);
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

  useEffect(() => {
    if (focusedOrderId && !orders.some((order) => order.id === focusedOrderId)) {
      setFocusedOrderId(null);
    }
  }, [focusedOrderId, orders]);

  async function updateOrderStatus(id: string, status: string) {
    setOrderActionError(null);
    const headers = await getAdminAuthHeaders(true);
    if (!headers) {
      setOrderActionError("Admin session is unavailable. Please sign in again.");
      return;
    }

    const response = await fetch("/api/admin/orders", {
      method: "PUT",
      headers,
      body: JSON.stringify({ id, status }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setOrderActionError(payload.error || "Failed to update order status.");
      return;
    }
    const payload = await response.json();
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...payload.order } : o)));
  }

  async function refreshPaymentStatus(order: AdminOrder) {
    setOrderActionError(null);
    const headers = await getAdminAuthHeaders(true);
    if (!headers) {
      setOrderActionError("Admin session is unavailable. Please sign in again.");
      return;
    }

    const response = await fetch("/api/admin/orders", {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "refresh_payment", id: order.id }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setOrderActionError(payload.error || "Failed to refresh payment status.");
      return;
    }

    setOrders((prev) => prev.map((entry) => (entry.id === order.id ? payload.order : entry)));
  }

  function patchDraft(orderId: string, patch: Partial<RefundDraft>) {
    setRefundDrafts((prev) => ({
      ...prev,
      [orderId]: { ...(prev[orderId] ?? emptyDraft()), ...patch },
    }));
  }

  async function submitRefund(order: AdminOrder, confirmed: boolean) {
    const draft = refundDrafts[order.id] ?? emptyDraft();
    const prepared = prepareRefundSubmit(draft.amount, confirmed);
    if (!prepared.callApi) {
      patchDraft(order.id, {
        confirming: prepared.openConfirm,
        fieldError: prepared.fieldError,
        notice: prepared.fieldError ? null : draft.notice,
        noticeTone: prepared.fieldError ? null : draft.noticeTone,
      });
      return;
    }

    const figures = orderFigures(order);
    if (prepared.amount > figures.remaining + 0.00001) {
      patchDraft(order.id, {
        confirming: false,
        fieldError: `Enter an amount up to ${formatPrice(figures.remaining)}.`,
      });
      return;
    }

    const headers = await getAdminAuthHeaders(true);
    if (!headers) {
      setOrderActionError("Admin session is unavailable. Please sign in again.");
      return;
    }

    const response = await fetch("/api/admin/orders", {
      method: "POST",
      headers,
      body: JSON.stringify({
        action: "refund",
        id: order.id,
        amount: prepared.amount,
        reason: draft.reason ?? "",
        confirm: true,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    const nextOrder = payload.order as AdminOrder | undefined;
    const attempt = interpretRefundAttempt({
      httpOk: response.ok,
      error: typeof payload.error === "string" ? payload.error : null,
      code: typeof payload.code === "string" ? payload.code : null,
      refundStatus: typeof payload.refundStatus === "string" ? payload.refundStatus : null,
      previousRefunded: Number(order.refunded_amount || 0),
      nextRefunded: Number(nextOrder?.refunded_amount ?? order.refunded_amount ?? 0),
      total: figures.total,
      amountLabel: formatPrice(prepared.amount),
      orderId: orderDisplayId(order.id),
      orderReturned: Boolean(nextOrder),
    });

    if (attempt.applyOrder && nextOrder) {
      const merged = orderAfterRefundAttempt(order, nextOrder, attempt.outcome);
      setOrders((prev) => prev.map((entry) => (entry.id === order.id ? merged : entry)));
    }

    const recorded = attempt.outcome === "partial" || attempt.outcome === "full";
    patchDraft(order.id, {
      amount: recorded ? "" : draft.amount,
      reason: recorded ? "" : draft.reason,
      confirming: false,
      fieldError: null,
      notice: attempt.message,
      noticeTone: attempt.outcome === "rejected" ? "failed" : attempt.outcome,
    });
  }

  function startEditingProduct(product: AdminProduct) {
    setEditingProductId(product.id);
    setProductError(null);
    setStockForm({
      sku: product.sku ?? "",
      stock_count: String(product.stock_count ?? 0),
      low_stock_threshold: String(product.low_stock_threshold ?? 5),
      in_stock: product.in_stock,
      variants: (product.product_variants ?? []).map((variant) => ({
        key: variant.id,
        size: variant.size ?? "",
        material: variant.material ?? "",
        sku: variant.sku,
        stock_count: String(variant.stock_count),
      })),
    });
  }

  function updateVariant(index: number, patch: Partial<VariantDraft>) {
    setStockForm((prev) => ({
      ...prev,
      variants: prev.variants.map((variant, variantIndex) =>
        variantIndex === index ? { ...variant, ...patch } : variant
      ),
    }));
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

      const cleanedVariants = stockForm.variants
        .map((variant) => ({
          size: variant.size || null,
          material: variant.material || null,
          sku: variant.sku.trim(),
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

  const revenue = sumOrderRevenue(orders);
  const lowStock = products.filter((product) => product.stock_count <= 5);
  const focusedOrder = orders.find((order) => order.id === focusedOrderId) ?? null;

  return (
    <div className="fade-in">
      <header className="admin-header">
        <a href="/" className="wordmark" aria-label={`${BRAND_EN} ${BRAND_ZH}`}>
          <span className="wordmark-en">{BRAND_EN}</span>
          <span className="wordmark-dot" aria-hidden="true">
            {BRAND_MARK}
          </span>
          <span className="wordmark-zh" lang="zh-Hant">
            {BRAND_ZH}
          </span>
        </a>
        <p className="admin-kicker">Admin</p>
      </header>

      {!authChecked || (user && isAdmin === null) ? (
        <div className="center-state">
          <p className="quiet">Loading</p>
        </div>
      ) : !isAdmin ? (
        <div className="center-state">
          <h1 className="page-title">Access denied</h1>
          <p className="quiet">
            {user ? `${user.email} is not an admin.` : "Please sign in with an admin account."}
          </p>
          <a href="/auth/login" className="btn-primary">
            Sign in
          </a>
        </div>
      ) : (
        <div className="admin-body">
          <nav className="admin-nav" aria-label="Admin">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`nav-btn${tab === item.key ? " is-active" : ""}`}
                aria-current={tab === item.key ? "page" : undefined}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <main className="admin-main">
            <div className="view-head">
              <h1 className="page-title">{tabTitle[tab]}</h1>
              <button type="button" onClick={() => void loadData()} className="text-btn">
                {loading ? "Refreshing" : "Refresh"}
              </button>
            </div>

            {tab === "dashboard" && (
              <div className="stat-grid">
                <Stat label="Products" value={String(products.length)} />
                <Stat label="Orders" value={String(orders.length)} />
                <Stat label="Revenue" value={formatPrice(revenue)} gold />
                <Stat label="Low stock" value={String(lowStock.length)} />
                <div className="panel panel-span">
                  <h2 className="section-label">Low stock</h2>
                  {lowStock.length === 0 ? (
                    <p className="quiet">All products are stocked.</p>
                  ) : (
                    <ul className="history">
                      {lowStock.map((product) => (
                        <li key={product.id}>
                          {product.name} <span className="gold">{product.stock_count} left</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {tab === "products" && (
              <div className="stack">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>SKU</th>
                        <th>Category</th>
                        <th>Price</th>
                        <th>Stock</th>
                        <th>Variants</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="empty">
                            No products yet.
                          </td>
                        </tr>
                      ) : (
                        products.map((product) => (
                          <tr key={product.id}>
                            <td>{product.name}</td>
                            <td>{product.sku || "\u2014"}</td>
                            <td>{product.categories?.name ?? "\u2014"}</td>
                            <td className="gold">{formatPrice(Number(product.price))}</td>
                            <td>
                              {!product.in_stock
                                ? `Out (${product.stock_count})`
                                : product.stock_count <= (product.low_stock_threshold ?? 5)
                                  ? `Low (${product.stock_count})`
                                  : product.stock_count}
                            </td>
                            <td>{product.product_variants?.length ?? 0}</td>
                            <td>
                              <button
                                type="button"
                                className="text-btn"
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
                  <div className="panel stack">
                    <h2 className="section-label">Inventory</h2>
                    <div className="form-grid two">
                      <label className="field">
                        <span>Product SKU</span>
                        <input
                          value={stockForm.sku}
                          onChange={(e) => setStockForm((prev) => ({ ...prev, sku: e.target.value }))}
                        />
                      </label>
                      <label className="field">
                        <span>Base stock</span>
                        <input
                          type="number"
                          min={0}
                          value={stockForm.stock_count}
                          onChange={(e) =>
                            setStockForm((prev) => ({ ...prev, stock_count: e.target.value }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Low stock threshold</span>
                        <input
                          type="number"
                          min={1}
                          value={stockForm.low_stock_threshold}
                          onChange={(e) =>
                            setStockForm((prev) => ({ ...prev, low_stock_threshold: e.target.value }))
                          }
                        />
                      </label>
                      <label className="check-row">
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
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Size</th>
                            <th>Material</th>
                            <th>SKU</th>
                            <th>Stock</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {stockForm.variants.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="empty">
                                No variants.
                              </td>
                            </tr>
                          ) : (
                            stockForm.variants.map((variant, index) => (
                              <tr key={variant.key}>
                                <td>
                                  <input
                                    aria-label="Size"
                                    value={variant.size}
                                    onChange={(e) => updateVariant(index, { size: e.target.value })}
                                  />
                                </td>
                                <td>
                                  <input
                                    aria-label="Material"
                                    value={variant.material}
                                    onChange={(e) => updateVariant(index, { material: e.target.value })}
                                  />
                                </td>
                                <td>
                                  <input
                                    aria-label="SKU"
                                    value={variant.sku}
                                    onChange={(e) => updateVariant(index, { sku: e.target.value })}
                                  />
                                </td>
                                <td>
                                  <input
                                    aria-label="Stock"
                                    type="number"
                                    min={0}
                                    value={variant.stock_count}
                                    onChange={(e) => updateVariant(index, { stock_count: e.target.value })}
                                  />
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="text-btn"
                                    onClick={() =>
                                      setStockForm((prev) => ({
                                        ...prev,
                                        variants: prev.variants.filter((_, variantIndex) => variantIndex !== index),
                                      }))
                                    }
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="actions">
                      <button
                        type="button"
                        className="text-btn"
                        onClick={() =>
                          setStockForm((prev) => ({
                            ...prev,
                            variants: [
                              ...prev.variants,
                              { key: nextVariantKey(), size: "", material: "", sku: "", stock_count: "0" },
                            ],
                          }))
                        }
                      >
                        Add variant
                      </button>
                      <button type="button" className="btn-primary" onClick={() => void saveProductInventory()}>
                        Save
                      </button>
                      <button type="button" className="text-btn" onClick={() => setEditingProductId(null)}>
                        Cancel
                      </button>
                    </div>
                    {productError ? <p className="field-error">{productError}</p> : null}
                  </div>
                )}
              </div>
            )}

            {tab === "orders" && (
              <div className={`orders-layout${focusedOrder ? " is-focused" : ""}`}>
                {orderActionError ? <p className="field-error">{orderActionError}</p> : null}
                <div className={`table-wrap order-list${focusedOrder ? " is-receded" : ""}`}>
                  <table>
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Customer</th>
                        {focusedOrder ? null : (
                          <>
                            <th>Payment</th>
                            <th>Fulfillment</th>
                          </>
                        )}
                        <th>Total</th>
                        {focusedOrder ? null : <th>Refunded</th>}
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.length === 0 ? (
                        <tr>
                          <td colSpan={focusedOrder ? 4 : 7} className="empty">
                            No orders yet.
                          </td>
                        </tr>
                      ) : (
                        orders.map((order) => {
                          const figures = orderFigures(order);
                          return (
                            <tr key={order.id}>
                              <td>
                                <p>{orderDisplayId(order.id)}</p>
                                <p className="quiet">{new Date(order.created_at).toLocaleString()}</p>
                              </td>
                              <td>{order.customer_name || order.customer_email || "Guest"}</td>
                              {focusedOrder ? null : (
                                <>
                                  <td>{(order.payment_status || figures.payment?.status || "unknown").replace(/_/g, " ")}</td>
                                  <td>
                                    <FulfillmentControl
                                      order={order}
                                      total={figures.total}
                                      settled={figures.settled}
                                      onStatus={(status) => void updateOrderStatus(order.id, status)}
                                    />
                                  </td>
                                </>
                              )}
                              <td className="gold">{formatPrice(figures.total)}</td>
                              {focusedOrder ? null : (
                                <td>
                                  {figures.settled <= 0 ? (
                                    <span className="quiet">{"\u2014"}</span>
                                  ) : (
                                    <span className="gold">{formatPrice(figures.settled)}</span>
                                  )}
                                </td>
                              )}
                              <td>
                                <button
                                  type="button"
                                  className="text-btn"
                                  onClick={() => setFocusedOrderId(order.id)}
                                  aria-pressed={focusedOrderId === order.id}
                                >
                                  Open
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {focusedOrder ? (
                  <OrderPanel
                    order={focusedOrder}
                    draft={refundDrafts[focusedOrder.id] ?? emptyDraft()}
                    onClose={() => setFocusedOrderId(null)}
                    onDraft={(patch) => patchDraft(focusedOrder.id, patch)}
                    onRefund={(confirmed) => void submitRefund(focusedOrder, confirmed)}
                    onStatus={(status) => void updateOrderStatus(focusedOrder.id, status)}
                    onRefresh={() => void refreshPaymentStatus(focusedOrder)}
                  />
                ) : null}
              </div>
            )}

            {tab === "customers" && (
              <Table
                head={["Customer", "Email", "Orders"]}
                rows={Object.values(
                  orders.reduce<Record<string, [string, string, number]>>((acc, order) => {
                    const key = order.customer_email || "guest";
                    if (!acc[key]) acc[key] = [order.customer_name || "Guest", order.customer_email || "\u2014", 0];
                    acc[key][2] += 1;
                    return acc;
                  }, {})
                ).map((row) => [row[0], row[1], String(row[2])])}
                empty="No customers yet."
              />
            )}

            {tab === "settings" && (
              <div className="panel">
                {settingsState === "ready" && settings ? (
                  <dl className="fact-list">
                    <Fact label="House name" value={settings.houseName} />
                    <Fact label="Legal entity" value={settings.legalEntity} />
                    <Fact label="Admin email" value={settings.adminEmail} />
                    <Fact label="Currency" value={settings.currencies.join(", ")} />
                    <Fact label="Airwallex mode" value={settings.airwallexMode} />
                    <Fact label="COD fee" value={formatPrice(settings.codFeeUsd)} />
                    <Fact label="Flat shipping" value={formatPrice(settings.flatShippingUsd)} />
                  </dl>
                ) : settingsState === "hidden" ? (
                  <dl className="fact-list">
                    <Fact label="Admin email" value={HIDDEN_ON_SERVER} />
                    <Fact label="Airwallex mode" value={HIDDEN_ON_SERVER} />
                  </dl>
                ) : (
                  <p className="quiet">Reading server settings.</p>
                )}
                <p className="note">{AIRWALLEX_SETTINGS_NOTE}</p>
              </div>
            )}
          </main>
        </div>
      )}

      <footer className="admin-footer">{LEGAL_ENTITY}</footer>
    </div>
  );
}

function Stat({ label, value, gold = false }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="stat">
      <p className="stat-label">{label}</p>
      <p className={`stat-value${gold ? " gold" : ""}`}>{value}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: string[][]; empty: string }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="empty">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.join("\u0000")}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function FulfillmentControl({
  order,
  total,
  settled,
  onStatus,
}: {
  order: AdminOrder;
  total: number;
  settled: number;
  onStatus: (status: string) => void;
}) {
  const rawPaymentStatus = order.payment_status || primaryPayment(order)?.status || "unknown";
  const paymentSucceeded =
    isSucceededPaymentStatus(order.payment_status) ||
    (order.payments ?? []).some((payment) => isSucceededPaymentStatus(payment.status));
  const statusPresentation = getAdminOrderStatusPresentation({
    status: order.status,
    fulfillmentStatus: order.fulfillment_status,
    paymentStatus: rawPaymentStatus,
  });
  const statusOptions = getOrderStatusOptions(
    statusPresentation.selectStatus,
    paymentSucceeded ? "succeeded" : rawPaymentStatus.toLowerCase()
  );
  const currentSelectValue =
    statusOptions.find((statusOption) => statusOption === statusPresentation.selectStatus) ??
    statusOptions[0];

  return (
    <div className="fulfillment-row">
      {statusPresentation.treatment !== "pipeline" ? (
        <span
          data-order-status-flag={statusPresentation.flagged ? "attention" : "neutral"}
          className="fulfillment-label"
        >
          {statusPresentation.label}
        </span>
      ) : (
        <span className="fulfillment-label">{formatOrderStatusLabel(statusPresentation.selectStatus)}</span>
      )}
      {statusPresentation.showDropdown ? (
        <select
          aria-label="Fulfillment"
          value={currentSelectValue}
          onChange={(e) => onStatus(e.target.value)}
          disabled={isFullyRefunded(total, settled)}
        >
          {statusOptions.map((statusOption) => (
            <option key={statusOption} value={statusOption}>
              {formatOrderStatusLabel(statusOption)}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

function OrderPanel({
  order,
  draft,
  onClose,
  onDraft,
  onRefund,
  onStatus,
  onRefresh,
}: {
  order: AdminOrder;
  draft: RefundDraft;
  onClose: () => void;
  onDraft: (patch: Partial<RefundDraft>) => void;
  onRefund: (confirmed: boolean) => void;
  onStatus: (status: string) => void;
  onRefresh: () => void;
}) {
  const figures = orderFigures(order);
  const displayId = orderDisplayId(order.id);
  const lines = orderLines(order.order_items);
  const address = formatCheckoutAddress(order.shipping_address);
  const method = paymentMethodLabel({
    paymentProvider: order.payment_provider || figures.payment?.provider,
    paymentMethod: typeof order.shipping_address?.payment_method === "string"
      ? order.shipping_address.payment_method
      : null,
  });
  const paid = isSucceededPaymentStatus(order.payment_status) ||
    (order.payments ?? []).some((payment) => isSucceededPaymentStatus(payment.status));
  const confirmAmount = Number(draft.amount);
  const showAfter = draft.confirming && Number.isFinite(confirmAmount) && confirmAmount > 0;
  const history = [
    ...(order.order_refunds ?? []).map((refund) => ({
      id: refund.id,
      created_at: refund.created_at,
      label: `${formatPrice(Number(refund.amount))}${refund.reason ? ` \u00b7 ${refund.reason}` : ""}`,
    })),
    ...((figures.payment?.payment_refunds ?? []).map((refund) => ({
      id: refund.id,
      created_at: refund.created_at,
      label: `${formatPrice(Number(refund.amount))} \u00b7 ${refund.status.toLowerCase()}${refund.reason ? ` \u00b7 ${refund.reason}` : ""}`,
    })) ?? []),
  ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const noticeClass =
    draft.noticeTone === "failed" || draft.noticeTone === "rejected" ? "notice-failed" : "quiet";

  return (
    <article className="order-panel" data-order-panel={displayId}>
      <div>
        <div className="view-head">
          <h2 className="order-title">Order {displayId}</h2>
          <button type="button" className="text-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="quiet">
          {order.customer_name || "Guest"}
          {order.customer_email ? ` \u00b7 ${order.customer_email}` : ""}
        </p>
        <p className="quiet">{new Date(order.created_at).toLocaleString()}</p>
      </div>

      <section className="order-section" aria-label="Items">
        <h3 className="section-label">Items</h3>
        {lines.length === 0 ? (
          <p className="quiet">No line items on this order.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>SKU</th>
                  <th>Quantity</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.name}</td>
                    <td>{line.sku}</td>
                    <td>{line.quantity}</td>
                    <td className="gold">{formatPrice(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="order-section" aria-label="Shipping">
        <h3 className="section-label">Shipping</h3>
        <FulfillmentControl
          order={order}
          total={figures.total}
          settled={figures.settled}
          onStatus={onStatus}
        />
        {address.length === 0 ? (
          <p className="quiet">No shipping address on this order.</p>
        ) : (
          <p className="address-lines">{address.join("\n")}</p>
        )}
      </section>

      <section className="order-section" aria-label="Payment">
        <h3 className="section-label">Payment</h3>
        <dl className="fact-list">
          <Fact label="Method" value={method} />
          <Fact label={paid ? "Paid" : "Amount"} value={formatPrice(figures.total)} />
          <Fact label="Remaining to refund" value={formatPrice(figures.remaining)} />
        </dl>
        {history.length > 0 ? (
          <ul className="history">
            {history.map((entry) => (
              <li key={entry.id}>{entry.label}</li>
            ))}
          </ul>
        ) : null}
        {figures.payment?.provider === "airwallex" ? (
          <button type="button" className="text-btn" onClick={onRefresh}>
            Refresh payment
          </button>
        ) : null}
      </section>

      <section className="order-section" aria-label="Refund">
        <h3 className="section-label">Refund</h3>
        {figures.remaining > 0 ? (
          <>
            <label className={`field${draft.fieldError ? " is-invalid" : ""}`}>
              <span>Amount</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                aria-invalid={draft.fieldError ? true : undefined}
                value={draft.amount}
                onChange={(e) =>
                  onDraft({
                    amount: e.target.value,
                    confirming: false,
                    fieldError: null,
                  })
                }
              />
              {draft.fieldError ? (
                <p className="field-error" role="alert">
                  {draft.fieldError}
                </p>
              ) : null}
            </label>
            <label className="field">
              <span>Reason</span>
              <input
                type="text"
                value={draft.reason}
                onChange={(e) => onDraft({ reason: e.target.value })}
              />
            </label>
            {draft.confirming ? (
              <div className="confirm-panel">
                <p className="confirm-prompt">
                  {refundConfirmPrompt(formatPrice(confirmAmount), displayId)}
                </p>
                {showAfter ? (
                  <p className="quiet">
                    Remaining after this refund {formatPrice(remainingAfterThisRefund(figures.remaining, confirmAmount))}.
                  </p>
                ) : null}
                <div className="actions">
                  <button type="button" className="btn-primary" onClick={() => onRefund(true)}>
                    Confirm refund
                  </button>
                  <button type="button" className="text-btn" onClick={() => onDraft({ confirming: false })}>
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <div className="actions">
                <button type="button" className="btn-primary" onClick={() => onRefund(false)}>
                  Refund
                </button>
              </div>
            )}
          </>
        ) : isFullyRefunded(figures.total, figures.settled) ? (
          <p className="quiet">Fully refunded.</p>
        ) : (
          <p className="quiet">Nothing remains to refund.</p>
        )}
        {draft.notice ? (
          <p className={noticeClass} role="status">
            {draft.notice}
          </p>
        ) : null}
      </section>
    </article>
  );
}
