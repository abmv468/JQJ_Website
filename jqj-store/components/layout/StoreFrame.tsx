"use client";

import { usePathname } from "next/navigation";
import { isCheckoutPath } from "@/lib/checkout-route";
import AnnouncementBar from "./AnnouncementBar";
import CartDrawer from "./CartDrawer";
import { CheckoutFooter, CheckoutHeader } from "./CheckoutChrome";
import Footer from "./Footer";
import Header from "./Header";

export default function StoreFrame({ children }: { children: React.ReactNode }) {
  const checkout = isCheckoutPath(usePathname());

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      {checkout ? (
        <CheckoutHeader />
      ) : (
        <>
          <AnnouncementBar />
          <Header />
        </>
      )}
      <main className="relative flex-1 pb-12">{children}</main>
      {checkout ? <CheckoutFooter /> : <Footer />}
      {checkout ? null : <CartDrawer />}
    </div>
  );
}
