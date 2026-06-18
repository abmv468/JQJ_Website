import Link from "next/link";
import { Facebook, Instagram, Twitter } from "lucide-react";

const columns = [
  {
    title: "Support",
    links: [
      { label: "Contact Us", href: "/contact" },
      { label: "FAQs", href: "/faqs" },
      { label: "Shipping", href: "/shipping" },
      { label: "How to Measure Your Wrist", href: "/measure" },
      { label: "Returns, Resizes & Exchanges", href: "/returns" },
      { label: "Repair", href: "/repair" },
      { label: "How to Care for Your Jewelry", href: "/care" },
    ],
  },
  {
    title: "Quick Links",
    links: [
      { label: "Loyalty Program", href: "/loyalty" },
      { label: "Shop All", href: "/new" },
      { label: "Bracelets", href: "/bracelets" },
      { label: "Necklaces", href: "/necklaces" },
    ],
  },
  {
    title: "#JQJGroup",
    links: [
      { label: "Our Story", href: "/story" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms & Conditions", href: "/terms" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-brand-border bg-black">
      <div className="container-site grid grid-cols-2 gap-10 py-16 md:grid-cols-4">
        {columns.map((col) => (
          <div key={col.title}>
            <h4 className="mb-5 font-heading text-xs uppercase tracking-wider2 text-white">
              {col.title}
            </h4>
            <ul className="space-y-3">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-xs text-brand-muted transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* Newsletter */}
        <div className="col-span-2 md:col-span-1">
          <h4 className="mb-5 font-heading text-xs uppercase tracking-wider2 text-white">
            Stay in the Loop
          </h4>
          <p className="mb-4 text-xs leading-relaxed text-brand-muted">
            New designs with limited stock every week and exclusive promotions.
          </p>
          <form className="space-y-3">
            <input
              type="email"
              placeholder="E-mail"
              className="input-field"
              aria-label="Email"
            />
            <button type="submit" className="btn-gold w-full">
              Subscribe
            </button>
          </form>
        </div>
      </div>

      <div className="border-t border-brand-border">
        <div className="container-site flex flex-col items-center justify-between gap-4 py-6 sm:flex-row">
          <p className="text-[11px] uppercase tracking-wider2 text-brand-muted">
            © {new Date().getFullYear()} — JQJ Group
          </p>
          <div className="flex items-center gap-5">
            <Link href="#" aria-label="Facebook">
              <Facebook className="h-4 w-4 text-brand-muted hover:text-white" />
            </Link>
            <Link href="#" aria-label="Twitter">
              <Twitter className="h-4 w-4 text-brand-muted hover:text-white" />
            </Link>
            <Link href="#" aria-label="Instagram">
              <Instagram className="h-4 w-4 text-brand-muted hover:text-white" />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
