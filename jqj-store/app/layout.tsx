import type { Metadata } from "next";
import { Instrument_Sans, Manrope } from "next/font/google";
import "./globals.css";

const heading = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "JQJ Group — Natural Stone Jewelry with Cultural Craft",
  description:
    "Handcrafted bracelets and necklaces inspired by Eastern cultural heritage, museum collaborations, and natural gemstone artistry.",
  icons: { icon: "/JQJ-logo.png" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body className="bg-brand-bg font-body text-white antialiased">
        {children}
      </body>
    </html>
  );
}
