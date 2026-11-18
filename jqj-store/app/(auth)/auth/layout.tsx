import AuthShell from "@/components/auth/AuthShell";
import { authMetadata } from "@/lib/auth/page-metadata";
import "./auth.css";

export const metadata = authMetadata;

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthShell>{children}</AuthShell>;
}
