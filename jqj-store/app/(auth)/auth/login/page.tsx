import type { Metadata } from "next";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: { absolute: "Sign in — Jewellery Quintessential" },
};

export default function LoginPage() {
  return <LoginForm />;
}
