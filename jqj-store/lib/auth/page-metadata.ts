import type { Metadata } from "next";
import { pageSocial } from "@/lib/page-social";

export const AUTH_TITLE = "Account — Jewellery Quintessential";
export const LOGIN_TITLE = "Sign in — Jewellery Quintessential";
export const LOGIN_DESCRIPTION = "Welcome back.";
export const AUTH_DESCRIPTION =
  "Create your account to save pieces and follow your orders.";

export const authMetadata: Metadata = {
  robots: {
    index: false,
    follow: true,
    googleBot: { index: false, follow: true },
  },
  title: { absolute: AUTH_TITLE },
  ...pageSocial({
    title: AUTH_TITLE,
    description: AUTH_DESCRIPTION,
  }),
};

export const loginMetadata: Metadata = {
  title: { absolute: LOGIN_TITLE },
  alternates: { canonical: "/auth/login" },
  ...pageSocial({
    title: LOGIN_TITLE,
    description: LOGIN_DESCRIPTION,
    path: "/auth/login",
  }),
};
