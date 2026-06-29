import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin — JQD Group",
};

// Admin is intentionally isolated from the store shell (no CartProvider,
// no store header/footer) to avoid hydration issues from localStorage.
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-brand-bg text-white">{children}</div>;
}
