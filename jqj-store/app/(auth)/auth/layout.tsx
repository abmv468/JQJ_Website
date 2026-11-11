import type { Metadata } from "next";
import AuthShell from "@/components/auth/AuthShell";
import "./auth.css";

export const metadata: Metadata = {
  robots: { index: false, follow: true },
  title: { absolute: "Account — Jewellery Quintessential" },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
