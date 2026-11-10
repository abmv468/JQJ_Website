import type { Metadata } from "next";
import PolicyPage from "@/components/trust/PolicyPage";
import { BRAND_NAME, SUPPORT_EMAIL } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Jewelry Repairs",
  description:
    `Request support for a ${BRAND_NAME} jewelry repair, including how to share photos, order details, and available service options.`,
  alternates: { canonical: "/repair" },
};

export default function RepairPage() {
  return (
    <PolicyPage
      title="Repairs"
      intro="Jewelry is made to be worn. When a piece needs attention, our support team can help assess the available repair options."
      effectiveDate="July 28, 2026"
      contactDetails={[
        {
          label: "Repair Support",
          value: SUPPORT_EMAIL,
          href: `mailto:${SUPPORT_EMAIL}`,
        },
      ]}
      sections={[
        {
          title: "Request an Assessment",
          paragraphs: [
            "Email support with your order number, a short description of the issue, and clear photos of the piece. We will review the request and confirm the available next steps.",
          ],
        },
        {
          title: "What We Can Review",
          bullets: [
            "Broken or stretched elastic cord.",
            "Loose components, clasps, or hardware.",
            "Wear that may need professional cleaning or restoration.",
          ],
        },
        {
          title: "Timing & Costs",
          paragraphs: [
            "Repair availability, timing, and costs vary by piece and condition. We will provide details before any work begins. Damage from normal wear, accidents, or third-party alterations may not be covered.",
          ],
        },
      ]}
    />
  );
}