import type { Metadata } from "next";
import { typesetFontVariables } from "@/components/auth/typeset-fonts";
import "./admin.css";

export const metadata: Metadata = {
  title: { absolute: "Admin — Jewellery Quintessential" },
  robots: { index: false, follow: false },
};

// Admin is intentionally isolated from the store shell (no CartProvider,
// no store header/footer) to avoid hydration issues from localStorage.
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={`jq-admin ${typesetFontVariables}`}>{children}</div>;
}
