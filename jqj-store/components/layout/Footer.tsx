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
      { label: "Rings", href: "/rings" },
      { label: "Earrings", href: "/earrings" },
    ],
  },
  {
    title: "#JQDGroup",
    links: [
      { label: "Our Story", href: "/story" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms & Conditions", href: "/terms" },
    ],
  },
];

const socialLinks = [
  { label: "Facebook", href: "#", icon: Facebook },
  { label: "Twitter", href: "#", icon: Twitter },
  { label: "Instagram", href: "#", icon: Instagram },
];

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-white/8 bg-black">
      <div className="container-site grid grid-cols-2 gap-10 py-16 md:grid-cols-4">
        {columns.map((col) => (
          <div key={col.title}>
            <h4
              className="mb-5 font-heading text-[11px] uppercase text-white/88"
              style={{ letterSpacing: "0.2em" }}
            >
              {col.title}
            </h4>
            <ul className="space-y-3">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/56 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="col-span-2 md:col-span-1">
          <h4
            className="mb-5 font-heading text-[11px] uppercase text-white/88"
            style={{ letterSpacing: "0.2em" }}
          >
            Stay in the Loop
          </h4>
          <p className="mb-4 text-sm leading-7 text-white/56">
            New gemstone edits, limited drops, and collector releases—sent
            sparingly.
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

      <div className="border-t border-white/8">
        <div className="container-site flex flex-col items-center justify-between gap-4 py-6 sm:flex-row">
          <p
            className="text-[11px] uppercase text-white/60"
            style={{ letterSpacing: "0.18em" }}
          >
            © {new Date().getFullYear()} — JQD Group
          </p>
          <div className="flex items-center gap-3">
            {socialLinks.map(({ label, href, icon: Icon }) => (
              <Link key={label} href={href} aria-label={label} className="icon-button h-10 w-10">
                <Icon className="h-4 w-4" />
              </Link>
            ))}
          </div>
          <p className="text-center text-xs text-white/56">
            Hand-finished natural stone pieces designed for everyday ritual.
          </p>
        </div>
      </div>
    </footer>
  );
}
