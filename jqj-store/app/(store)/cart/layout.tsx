import type { Metadata } from "next";
import { pageSocial } from "@/lib/page-social";

const TITLE = "Cart — Jewellery Quintessential";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  alternates: { canonical: "/cart" },
  robots: { index: false, follow: true },
  ...pageSocial({
    title: TITLE,
    description: "Discover bracelets and necklaces selected for everyday wear.",
    path: "/cart",
  }),
};

export default function CartLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
