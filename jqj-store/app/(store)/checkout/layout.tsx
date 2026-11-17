import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Checkout — Jewellery Quintessential" },
  alternates: { canonical: "/checkout" },
  robots: { index: false, follow: true },
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}