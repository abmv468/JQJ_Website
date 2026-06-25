"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/utils";
import { formatOrderStatusLabel, hasPartialRefund, isFullyRefunded } from "@/lib/order-lifecycle";

interface OrderRow {
  id: string;
  status: string;
  total_amount: number;
  refunded_amount: number | null;
  created_at: string;
}

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
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
      const { data: orderData } = await supabase
        .from("orders")
        .select("id, status, total_amount, refunded_amount, created_at")
        .order("created_at", { ascending: false });
      setOrders(orderData ?? []);
      setLoading(false);
    });
  }, [router]);

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

      <h2 className="mb-4 font-heading text-sm uppercase tracking-wider2">Order History</h2>
      {orders.length === 0 ? (
        <p className="text-sm text-brand-muted">You have no orders yet.</p>
      ) : (
        <div className="overflow-x-auto border border-brand-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-brand-border text-xs uppercase tracking-wider2 text-brand-muted">
              <tr>
                <th className="p-4">Order</th>
                <th className="p-4">Date</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-brand-border/60">
                  <td className="p-4 font-mono text-xs">{o.id.slice(0, 8)}</td>
                  <td className="p-4 text-brand-muted">{new Date(o.created_at).toLocaleDateString()}</td>
                  <td className="p-4">
                    {formatOrderStatusLabel(o.status)}
                    {hasPartialRefund(Number(o.total_amount), Number(o.refunded_amount || 0)) && (
                      <span className="ml-2 text-xs text-brand-muted">(partial refund)</span>
                    )}
                    {isFullyRefunded(Number(o.total_amount), Number(o.refunded_amount || 0)) && (
                      <span className="ml-2 text-xs text-brand-muted">(fully refunded)</span>
                    )}
                  </td>
                  <td className="p-4 text-right text-brand-gold">{formatPrice(o.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
