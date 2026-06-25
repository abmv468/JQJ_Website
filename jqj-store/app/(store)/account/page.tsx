"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/lib/utils";
import { formatOrderStatusLabel, hasPartialRefund, isFullyRefunded } from "@/lib/order-lifecycle";

interface ProfileRow {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
}

interface AddressRow {
  id: string;
  user_id: string;
  label: string | null;
  first_name: string | null;
  last_name: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  region: string | null;
  postal_code: string | null;
  country: string;
  phone: string | null;
  is_default: boolean;
  created_at: string;
}

interface OrderItemRow {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  price_at_purchase: number;
  line_item_meta: Record<string, unknown> | null;
}

interface OrderRow {
  id: string;
  status: string;
  total_amount: number;
  refunded_amount: number | null;
  shipping_amount: number;
  customer_name: string | null;
  customer_email: string | null;
  shipping_address: Record<string, unknown> | null;
  created_at: string;
  order_items: OrderItemRow[];
}

interface ProductLookup {
  id: string;
  slug: string | null;
  name: string;
  price: number;
  images: string[] | null;
}

type AddressForm = {
  label: string;
  firstName: string;
  lastName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone: string;
  isDefault: boolean;
};

const DEFAULT_ADDRESS_FORM: AddressForm = {
  label: "Shipping",
  firstName: "",
  lastName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "United States",
  phone: "",
  isDefault: true,
};

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getMetaString(meta: Record<string, unknown> | null, key: string) {
  const value = meta?.[key];
  return typeof value === "string" ? value : "";
}

export default function AccountPage() {
  const router = useRouter();
  const { addItem } = useCart();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState({ firstName: "", lastName: "", phone: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [addressForm, setAddressForm] = useState<AddressForm>(DEFAULT_ADDRESS_FORM);
  const [addressEditingId, setAddressEditingId] = useState<string | null>(null);
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressMessage, setAddressMessage] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [productsById, setProductsById] = useState<Record<string, ProductLookup>>({});
  const [productsBySlug, setProductsBySlug] = useState<Record<string, ProductLookup>>({});
  const [productsByName, setProductsByName] = useState<Record<string, ProductLookup>>({});
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [orderMessage, setOrderMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.push("/auth/login");
        return;
      }
      setUser(data.user);

      const [profileRes, addressRes, orderRes, productsRes] = await Promise.all([
        supabase
          .from("customer_profiles")
          .select("first_name, last_name, phone")
          .eq("user_id", data.user.id)
          .maybeSingle(),
        supabase
          .from("customer_addresses")
          .select("*")
          .eq("user_id", data.user.id)
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("orders")
          .select(
            "id, status, total_amount, refunded_amount, shipping_amount, customer_name, customer_email, shipping_address, created_at, order_items(id, product_id, product_name, quantity, price_at_purchase, line_item_meta)"
          )
          .eq("user_id", data.user.id)
          .order("created_at", { ascending: false }),
        supabase.from("products").select("id, slug, name, price, images"),
      ]);

      const profileData = profileRes.data as ProfileRow | null;
      setProfile({
        firstName: profileData?.first_name || "",
        lastName: profileData?.last_name || "",
        phone: profileData?.phone || "",
      });

      const addressData = (addressRes.data ?? []) as AddressRow[];
      setAddresses(addressData);
      if (addressData.length) {
        setAddressForm((prev) => ({ ...prev, isDefault: false }));
      }

      const orderData = ((orderRes.data ?? []) as OrderRow[]).map((order) => ({
        ...order,
        order_items: order.order_items ?? [],
      }));
      setOrders(orderData);

      const firstOrder = orderData[0];
      if (firstOrder) {
        setExpandedOrders({ [firstOrder.id]: true });
      }

      const products = (productsRes.data ?? []) as ProductLookup[];
      const byId: Record<string, ProductLookup> = {};
      const bySlug: Record<string, ProductLookup> = {};
      const byName: Record<string, ProductLookup> = {};
      products.forEach((product) => {
        byId[product.id] = product;
        if (product.slug) bySlug[product.slug] = product;
        byName[product.name.toLowerCase()] = product;
      });
      setProductsById(byId);
      setProductsBySlug(bySlug);
      setProductsByName(byName);
      setLoading(false);
    });
  }, [router]);

  async function refreshAddresses(currentUserId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("customer_addresses")
      .select("*")
      .eq("user_id", currentUserId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    setAddresses((data ?? []) as AddressRow[]);
  }

  async function signOut() {
    const supabase = createClient();
    setSignOutError(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setSignOutError(error.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function saveProfile() {
    if (!user) return;
    setProfileSaving(true);
    setProfileMessage(null);
    const supabase = createClient();
    const { error } = await supabase.from("customer_profiles").upsert(
      {
        user_id: user.id,
        first_name: profile.firstName.trim() || null,
        last_name: profile.lastName.trim() || null,
        phone: profile.phone.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    setProfileSaving(false);
    setProfileMessage(error ? error.message : "Profile saved.");
  }

  function editAddress(address: AddressRow) {
    setAddressEditingId(address.id);
    setAddressForm({
      label: address.label || "Shipping",
      firstName: address.first_name || "",
      lastName: address.last_name || "",
      addressLine1: address.address_line1 || "",
      addressLine2: address.address_line2 || "",
      city: address.city || "",
      region: address.region || "",
      postalCode: address.postal_code || "",
      country: address.country || "United States",
      phone: address.phone || "",
      isDefault: address.is_default,
    });
  }

  function resetAddressForm() {
    setAddressEditingId(null);
    setAddressForm({ ...DEFAULT_ADDRESS_FORM, isDefault: addresses.length === 0 });
  }

  async function saveAddress() {
    if (!user) return;
    if (!addressForm.addressLine1 || !addressForm.city || !addressForm.country) {
      setAddressMessage("Address, city, and country are required.");
      return;
    }

    setAddressSaving(true);
    setAddressMessage(null);
    const supabase = createClient();

    if (addressForm.isDefault) {
      await supabase.from("customer_addresses").update({ is_default: false }).eq("user_id", user.id);
    }

    const payload = {
      user_id: user.id,
      label: addressForm.label.trim() || "Shipping",
      first_name: addressForm.firstName.trim() || null,
      last_name: addressForm.lastName.trim() || null,
      address_line1: addressForm.addressLine1.trim(),
      address_line2: addressForm.addressLine2.trim() || null,
      city: addressForm.city.trim(),
      region: addressForm.region.trim() || null,
      postal_code: addressForm.postalCode.trim() || null,
      country: addressForm.country.trim(),
      phone: addressForm.phone.trim() || null,
      is_default: addressForm.isDefault,
      updated_at: new Date().toISOString(),
    };

    const query = addressEditingId
      ? supabase.from("customer_addresses").update(payload).eq("id", addressEditingId)
      : supabase.from("customer_addresses").insert(payload);
    const { error } = await query;

    setAddressSaving(false);
    if (error) {
      setAddressMessage(error.message);
      return;
    }
    await refreshAddresses(user.id);
    resetAddressForm();
    setAddressMessage("Address saved.");
  }

  async function removeAddress(id: string, isDefault: boolean) {
    if (!user) return;
    const supabase = createClient();
    const { error } = await supabase.from("customer_addresses").delete().eq("id", id);
    if (error) {
      setAddressMessage(error.message);
      return;
    }

    const nextAddresses = addresses.filter((a) => a.id !== id);
    if (isDefault && nextAddresses.length) {
      await supabase
        .from("customer_addresses")
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq("id", nextAddresses[0].id);
    }
    await refreshAddresses(user.id);
    if (addressEditingId === id) {
      resetAddressForm();
    }
    setAddressMessage("Address removed.");
  }

  async function setDefaultAddress(id: string) {
    if (!user) return;
    const supabase = createClient();
    await supabase.from("customer_addresses").update({ is_default: false }).eq("user_id", user.id);
    const { error } = await supabase
      .from("customer_addresses")
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      setAddressMessage(error.message);
      return;
    }
    await refreshAddresses(user.id);
    setAddressMessage("Default address updated.");
  }

  function reorder(order: OrderRow) {
    let added = 0;
    order.order_items.forEach((line) => {
      const meta = line.line_item_meta;
      const productSlug = getMetaString(meta, "product_slug");
      const cartItemId = getMetaString(meta, "cart_item_id");
      const size = getMetaString(meta, "size");
      const image = getMetaString(meta, "image");

      const matchedProduct =
        (line.product_id ? productsById[line.product_id] : undefined) ||
        (productSlug ? productsBySlug[productSlug] : undefined) ||
        productsByName[line.product_name.toLowerCase()];

      const slug = matchedProduct?.slug || productSlug || slugify(line.product_name);
      const cartId = matchedProduct?.id || cartItemId || slug || `legacy-${line.id}`;
      if (!slug) return;

      addItem(
        {
          id: cartId,
          slug,
          name: matchedProduct?.name || line.product_name,
          price: Number(matchedProduct?.price ?? line.price_at_purchase),
          image: matchedProduct?.images?.[0] || image || "/products/lifestyle.webp",
          size: size || undefined,
        },
        line.quantity
      );
      added += line.quantity;
    });

    if (added > 0) {
      setOrderMessage(`Added ${added} item${added > 1 ? "s" : ""} to your cart.`);
      router.push("/cart");
      return;
    }
    setOrderMessage("No reorderable items were found for this order.");
  }

  function toggleOrder(orderId: string) {
    setExpandedOrders((prev) => ({ ...prev, [orderId]: !prev[orderId] }));
  }

  function formatAddress(order: OrderRow) {
    const shipping = order.shipping_address ?? {};
    const address = typeof shipping.address === "string" ? shipping.address : "";
    const apartment = typeof shipping.apartment === "string" ? shipping.apartment : "";
    const city = typeof shipping.city === "string" ? shipping.city : "";
    const region = typeof shipping.region === "string" ? shipping.region : "";
    const country = typeof shipping.country === "string" ? shipping.country : "";
    return [address, apartment, city, region, country].filter(Boolean).join(", ");
  }

  function paymentMethod(order: OrderRow) {
    const method = order.shipping_address?.payment_method;
    return typeof method === "string" ? method.toUpperCase() : "N/A";
  }

  if (loading) {
    return (
      <div className="container-site py-28 text-center text-sm text-brand-muted">
        Loading your account…
      </div>
    );
  }

  return (
    <div className="container-site py-12">
      <div className="mb-10 flex items-center justify-between">
        <h1 className="font-heading text-2xl uppercase tracking-wider2">My Account</h1>
        <button type="button" onClick={signOut} className="btn-secondary">Sign Out</button>
      </div>

      <p className="mb-10 text-sm text-brand-muted">
        Signed in as <span className="text-white">{user?.email}</span>
      </p>
      {signOutError && <p className="mb-6 text-sm text-red-400">{signOutError}</p>}

      <section className="mb-10 border border-brand-border p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-heading text-sm uppercase tracking-wider2">Profile</h2>
          <button type="button" disabled={profileSaving} onClick={saveProfile} className="btn-gold disabled:opacity-60">
            {profileSaving ? "Saving…" : "Save Profile"}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input
            className="input-field"
            placeholder="First name"
            value={profile.firstName}
            onChange={(e) => setProfile((prev) => ({ ...prev, firstName: e.target.value }))}
          />
          <input
            className="input-field"
            placeholder="Last name"
            value={profile.lastName}
            onChange={(e) => setProfile((prev) => ({ ...prev, lastName: e.target.value }))}
          />
          <input
            className="input-field md:col-span-2"
            placeholder="Phone"
            value={profile.phone}
            onChange={(e) => setProfile((prev) => ({ ...prev, phone: e.target.value }))}
          />
          <input className="input-field md:col-span-2" value={user?.email || ""} disabled readOnly />
        </div>
        {profileMessage && <p className="mt-3 text-xs text-brand-gold">{profileMessage}</p>}
      </section>

      <section className="mb-10 border border-brand-border p-6">
        <h2 className="mb-5 font-heading text-sm uppercase tracking-wider2">Saved Addresses</h2>
        {addresses.length === 0 ? (
          <p className="mb-4 text-sm text-brand-muted">You have no saved addresses yet.</p>
        ) : (
          <div className="mb-6 space-y-3">
            {addresses.map((address) => (
              <div key={address.id} className="border border-brand-border/60 p-4 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-heading text-xs uppercase tracking-wider2">{address.label || "Address"}</span>
                  {address.is_default && <span className="text-xs text-brand-gold">Default</span>}
                </div>
                <p className="text-brand-muted">
                  {[
                    [address.first_name, address.last_name].filter(Boolean).join(" "),
                    [address.address_line1, address.address_line2, address.city, address.region, address.postal_code, address.country]
                      .filter(Boolean)
                      .join(", "),
                  ]
                    .filter(Boolean)
                    .join(" — ")}
                </p>
                {address.phone && <p className="mt-1 text-brand-muted">Phone: {address.phone}</p>}
                <div className="mt-3 flex flex-wrap gap-3">
                  <button type="button" className="text-xs text-brand-gold underline" onClick={() => editAddress(address)}>
                    Edit
                  </button>
                  {!address.is_default && (
                    <button type="button" className="text-xs text-brand-gold underline" onClick={() => setDefaultAddress(address.id)}>
                      Set default
                    </button>
                  )}
                  <button type="button" className="text-xs text-red-400 underline" onClick={() => removeAddress(address.id, address.is_default)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <h3 className="mb-3 font-heading text-xs uppercase tracking-wider2">
          {addressEditingId ? "Edit Address" : "Add Address"}
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input className="input-field" placeholder="Label" value={addressForm.label} onChange={(e) => setAddressForm((prev) => ({ ...prev, label: e.target.value }))} />
          <input className="input-field" placeholder="Country" value={addressForm.country} onChange={(e) => setAddressForm((prev) => ({ ...prev, country: e.target.value }))} />
          <input className="input-field" placeholder="First name" value={addressForm.firstName} onChange={(e) => setAddressForm((prev) => ({ ...prev, firstName: e.target.value }))} />
          <input className="input-field" placeholder="Last name" value={addressForm.lastName} onChange={(e) => setAddressForm((prev) => ({ ...prev, lastName: e.target.value }))} />
          <input className="input-field md:col-span-2" placeholder="Address line 1" value={addressForm.addressLine1} onChange={(e) => setAddressForm((prev) => ({ ...prev, addressLine1: e.target.value }))} />
          <input className="input-field md:col-span-2" placeholder="Address line 2" value={addressForm.addressLine2} onChange={(e) => setAddressForm((prev) => ({ ...prev, addressLine2: e.target.value }))} />
          <input className="input-field" placeholder="City" value={addressForm.city} onChange={(e) => setAddressForm((prev) => ({ ...prev, city: e.target.value }))} />
          <input className="input-field" placeholder="Region / State" value={addressForm.region} onChange={(e) => setAddressForm((prev) => ({ ...prev, region: e.target.value }))} />
          <input className="input-field" placeholder="Postal code" value={addressForm.postalCode} onChange={(e) => setAddressForm((prev) => ({ ...prev, postalCode: e.target.value }))} />
          <input className="input-field" placeholder="Phone" value={addressForm.phone} onChange={(e) => setAddressForm((prev) => ({ ...prev, phone: e.target.value }))} />
        </div>
        <label className="mt-3 inline-flex items-center gap-2 text-xs text-brand-muted">
          <input
            type="checkbox"
            checked={addressForm.isDefault}
            onChange={(e) => setAddressForm((prev) => ({ ...prev, isDefault: e.target.checked }))}
            className="accent-brand-gold"
          />
          Set as default address
        </label>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" disabled={addressSaving} onClick={saveAddress} className="btn-gold disabled:opacity-60">
            {addressSaving ? "Saving…" : addressEditingId ? "Update Address" : "Save Address"}
          </button>
          {addressEditingId && (
            <button type="button" onClick={resetAddressForm} className="btn-secondary">
              Cancel
            </button>
          )}
        </div>
        {addressMessage && <p className="mt-3 text-xs text-brand-gold">{addressMessage}</p>}
      </section>

      <h2 className="mb-4 font-heading text-sm uppercase tracking-wider2">Order History</h2>
      {orderMessage && <p className="mb-4 text-sm text-brand-gold">{orderMessage}</p>}
      {orders.length === 0 ? (
        <p className="text-sm text-brand-muted">You have no orders yet.</p>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <article key={order.id} className="border border-brand-border">
              <div className="flex flex-col gap-3 border-b border-brand-border p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-mono text-xs text-brand-muted">#{order.id.slice(0, 8)}</p>
                  <p className="text-xs text-brand-muted">{new Date(order.created_at).toLocaleString()}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span>
                    {formatOrderStatusLabel(order.status)}
                    {hasPartialRefund(Number(order.total_amount), Number(order.refunded_amount || 0)) && (
                      <span className="ml-2 text-xs text-brand-muted">(partial refund)</span>
                    )}
                    {isFullyRefunded(Number(order.total_amount), Number(order.refunded_amount || 0)) && (
                      <span className="ml-2 text-xs text-brand-muted">(fully refunded)</span>
                    )}
                  </span>
                  <span className="text-brand-gold">{formatPrice(order.total_amount)}</span>
                  <button type="button" onClick={() => toggleOrder(order.id)} className="btn-secondary px-4 py-2">
                    {expandedOrders[order.id] ? "Hide Details" : "View Details"}
                  </button>
                  <button type="button" onClick={() => reorder(order)} className="btn-gold px-4 py-2">
                    Reorder
                  </button>
                </div>
              </div>

              {expandedOrders[order.id] && (
                <div className="space-y-4 p-4 text-sm">
                  <div className="overflow-x-auto border border-brand-border/60">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-brand-border/60 text-xs uppercase tracking-wider2 text-brand-muted">
                        <tr>
                          <th className="p-3">Item</th>
                          <th className="p-3">Qty</th>
                          <th className="p-3 text-right">Price</th>
                          <th className="p-3 text-right">Line Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.order_items.map((item) => (
                          <tr key={item.id} className="border-b border-brand-border/40">
                            <td className="p-3">{item.product_name}</td>
                            <td className="p-3">{item.quantity}</td>
                            <td className="p-3 text-right">{formatPrice(item.price_at_purchase)}</td>
                            <td className="p-3 text-right">{formatPrice(item.price_at_purchase * item.quantity)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="border border-brand-border/60 p-3">
                      <p className="mb-1 text-xs uppercase tracking-wider2 text-brand-muted">Shipping</p>
                      <p>{order.customer_name || "N/A"}</p>
                      <p className="text-brand-muted">{order.customer_email || "N/A"}</p>
                      <p className="mt-1 text-brand-muted">{formatAddress(order) || "N/A"}</p>
                    </div>
                    <div className="border border-brand-border/60 p-3">
                      <p className="mb-1 text-xs uppercase tracking-wider2 text-brand-muted">Payment & Totals</p>
                      <p>Method: {paymentMethod(order)}</p>
                      <p>Shipping: {formatPrice(order.shipping_amount || 0)}</p>
                      <p className="text-brand-gold">Total: {formatPrice(order.total_amount)}</p>
                    </div>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
