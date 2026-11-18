import type { Metadata } from "next";
import { pageSocial } from "@/lib/page-social";

export const LOYALTY_TITLE = "Collector Updates — Jewellery Quintessential";
export const LOYALTY_DESCRIPTION = "Join our list for new pieces and updates.";

export const loyaltyMetadata: Metadata = {
  title: { absolute: LOYALTY_TITLE },
  alternates: { canonical: "/loyalty" },
  ...pageSocial({
    title: LOYALTY_TITLE,
    description: LOYALTY_DESCRIPTION,
    path: "/loyalty",
  }),
};
