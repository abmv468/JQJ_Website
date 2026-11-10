import type { Metadata } from "next";
import { Instrument_Sans, Manrope } from "next/font/google";
import "./globals.css";
import { CurrencyProvider } from "@/context/CurrencyContext";
import {
  BRAND_NAME,
  BRAND_NAME_FULL,
  BRAND_NAME_ZH,
  BRAND_OG_IMAGE_ALT,
  BRAND_HOME_DESCRIPTION,
  BRAND_SOCIAL_TITLE,
  BRAND_TITLE_DEFAULT,
  BRAND_TITLE_TEMPLATE,
} from "@/lib/brand";
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

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: BRAND_TITLE_DEFAULT,
    template: BRAND_TITLE_TEMPLATE,
  },
  description: BRAND_HOME_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: BRAND_NAME,
    title: BRAND_SOCIAL_TITLE,
    description: BRAND_HOME_DESCRIPTION,
    images: [
      {
        url: "/products/hero-image.jpg",
        width: 1200,
        height: 630,
        alt: BRAND_OG_IMAGE_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND_SOCIAL_TITLE,
    description: BRAND_HOME_DESCRIPTION,
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
    name: BRAND_NAME,
    alternateName: [BRAND_NAME_ZH, BRAND_NAME_FULL],
    url: absoluteUrl(),
    logo: absoluteUrl("/JQD-logo.png"),
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: BRAND_NAME,
    alternateName: BRAND_NAME_ZH,
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
