import type { Metadata } from "next";
import ForgotPasswordForm from "./forgot-form";

export const metadata: Metadata = {
  title: { absolute: "Forgot password — Jewellery Quintessential" },
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
