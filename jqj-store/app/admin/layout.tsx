import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: { absolute: `Admin — ${BRAND_NAME}` },
  robots: { index: false, follow: false },
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
