import Link from "next/link";
import { BRAND_EN, BRAND_ZH } from "@/lib/auth/brand";
import { typesetFontVariables } from "./typeset-fonts";

export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={`jq-auth ${typesetFontVariables}`}>
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
