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
  title: "JQJ Group — Premium Natural Stone Jewelry",
  description:
    "Hand-crafted bracelets and necklaces made with premium natural stones and materials. JQJ Group.",
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
