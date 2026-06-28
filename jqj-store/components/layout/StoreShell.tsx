import AnnouncementBar from "./AnnouncementBar";
import Header from "./Header";
import Footer from "./Footer";
import CartDrawer from "./CartDrawer";
import InteractiveBackground from "./InteractiveBackground";

export default function StoreShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-x-clip bg-brand-bg">
      <InteractiveBackground />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_55%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[24rem] bg-[radial-gradient(circle_at_bottom,rgba(24,76,82,0.16),transparent_60%)]"
      />
      <div className="relative z-10 flex min-h-screen flex-col">
        <AnnouncementBar />
        <Header />
        <main className="relative flex-1 pb-12">{children}</main>
        <Footer />
        <CartDrawer />
      </div>
    </div>
  );
}
