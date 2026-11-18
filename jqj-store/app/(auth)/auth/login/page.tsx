import { loginMetadata } from "@/lib/auth/page-metadata";
import LoginForm from "./login-form";

export const metadata = loginMetadata;

export default function LoginPage() {
  return <LoginForm />;
}
