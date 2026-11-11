import type { Metadata } from "next";
import ResetPasswordForm from "./reset-form";

export const metadata: Metadata = {
  title: { absolute: "Reset password — Jewellery Quintessential" },
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
