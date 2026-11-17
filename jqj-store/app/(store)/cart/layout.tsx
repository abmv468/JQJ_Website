import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Cart — Jewellery Quintessential" },
  alternates: { canonical: "/cart" },
  robots: { index: false, follow: true },
};

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return children;
}