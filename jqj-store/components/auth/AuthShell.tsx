import localFont from "next/font/local";
import Link from "next/link";
import { BRAND_EN, BRAND_ZH } from "@/lib/auth/brand";

const heading = localFont({
  src: [
    {
      path: "../../assets/fonts/InstrumentSans-Variable.ttf",
      weight: "400 700",
      style: "normal",
    },
  ],
  variable: "--font-auth-heading",
  display: "swap",
  adjustFontFallback: false,
});

const body = localFont({
  src: [
    {
      path: "../../assets/fonts/Manrope-Variable.ttf",
      weight: "200 800",
      style: "normal",
    },
  ],
  variable: "--font-auth-body",
  display: "swap",
  adjustFontFallback: false,
});

const zh = localFont({
  src: [
    {
      path: "../../assets/fonts/NotoSerifCJKtc-JQ.otf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-auth-zh",
  display: "swap",
  adjustFontFallback: false,
});

export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={`jq-auth ${heading.variable} ${body.variable} ${zh.variable}`}>
      <header className="auth-header">
        <Link href="/" className="wordmark" aria-label={`${BRAND_EN} ${BRAND_ZH}`}>
          <span className="wordmark-en">{BRAND_EN}</span>
          <span className="wordmark-dot" aria-hidden="true">
            ·
          </span>
          <span className="wordmark-zh" lang="zh-Hant">
            {BRAND_ZH}
          </span>
        </Link>
        <Link href="/" className="shop-link">
          Back to shop
        </Link>
      </header>
      {children}
    </div>
  );
}
