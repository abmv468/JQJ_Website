import type { Metadata } from "next";
import { pageSocial } from "@/lib/page-social";

const TITLE = "Order confirmation — Jewellery Quintessential";
const DESCRIPTION = "Thank you for your order.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  // Each receipt has its own query string, so there is no shared canonical.
  alternates: { canonical: null },
  robots: {
    index: false,
    follow: true,
    googleBot: { index: false, follow: true },
  },
  ...pageSocial({
    title: TITLE,
    description: DESCRIPTION,
    path: "/order-confirmation",
  }),
};

export default function OrderConfirmationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
