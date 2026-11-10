import type { Metadata } from "next";
import { Instrument_Sans, Manrope } from "next/font/google";
import "./globals.css";
import { CurrencyProvider } from "@/context/CurrencyContext";
import { SITE_DESCRIPTION } from "@/lib/policy";
import { absoluteUrl, jsonLd, siteUrl } from "@/lib/seo";

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

const description =
  SITE_DESCRIPTION ||
  "Handcrafted bracelets and necklaces inspired by Eastern cultural heritage, museum collaborations, and natural gemstone artistry.";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "JQD Group | Natural Stone Jewelry with Cultural Craft",
    template: "%s | JQD Group",
  },
  description,
  icons: { icon: "/JQD-logo.png" },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "JQD Group",
    title: "JQD Group | Natural Stone Jewelry with Cultural Craft",
    description,
    images: [
      {
        url: "/products/hero-image.jpg",
        width: 1200,
        height: 630,
        alt: "JQD Group natural stone jewelry",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "JQD Group | Natural Stone Jewelry with Cultural Craft",
    description,
    images: ["/products/hero-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "JQD Group",
    url: absoluteUrl(),
    logo: absoluteUrl("/JQD-logo.png"),
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "JQD Group",
    url: absoluteUrl(),
  };

  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(websiteSchema) }}
        />
      </head>
      <body className="bg-brand-bg font-body text-white antialiased">
        <CurrencyProvider>{children}</CurrencyProvider>
      </body>
    </html>
  );
}
