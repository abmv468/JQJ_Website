import type { Metadata } from "next";
import { Instrument_Sans, Manrope } from "next/font/google";
import "./globals.css";
import { CurrencyProvider } from "@/context/CurrencyContext";
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

const HOUSE_NAME = "Jewellery Quintessential";
const ROOT_TITLE =
  "Jewellery Quintessential · 極氣 | Natural Stone Jewellery with Cultural Craft";
const ROOT_DESCRIPTION =
  "Bracelets and necklaces inspired by Eastern cultural heritage, museum collaborations, and natural gemstone artistry.";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: ROOT_TITLE,
    template: "%s — Jewellery Quintessential",
  },
  description: ROOT_DESCRIPTION,
  icons: {
    icon: [
      {
        url: "/favicon-light.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/favicon-dark.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: dark)",
      },
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: {
      url: "/apple-touch-icon.png",
      sizes: "180x180",
      type: "image/png",
    },
  },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: HOUSE_NAME,
    title: ROOT_TITLE,
    description: ROOT_DESCRIPTION,
    images: [
      {
        url: "/products/hero-image.jpg",
        width: 1200,
        height: 630,
        alt: "Jewellery Quintessential natural stone jewellery",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: ROOT_TITLE,
    description: ROOT_DESCRIPTION,
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
    name: HOUSE_NAME,
    url: absoluteUrl(),
    logo: absoluteUrl("/icon-512.png"),
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: HOUSE_NAME,
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
        <a className="skip-to-content" href="#main-content">
          Skip to content
        </a>
        <CurrencyProvider>{children}</CurrencyProvider>
      </body>
    </html>
  );
}
