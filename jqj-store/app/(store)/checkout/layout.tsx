import type { Metadata } from "next";
import { pageSocial } from "@/lib/page-social";

const TITLE = "Checkout — Jewellery Quintessential";
const DESCRIPTION = "Secure payment.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  alternates: { canonical: "/checkout" },
  robots: {
    index: false,
    follow: true,
    googleBot: { index: false, follow: true },
  },
  ...pageSocial({
    title: TITLE,
    description: DESCRIPTION,
    path: "/checkout",
  }),
};

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
