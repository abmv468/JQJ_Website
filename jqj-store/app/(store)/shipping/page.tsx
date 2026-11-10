import type { Metadata } from "next";
import PolicyPage from "@/components/trust/PolicyPage";
import { DELIVERY_RANGE, DUTIES_LINE, FREE_SHIPPING_OVER_250 } from "@/lib/brand-copy";

export const metadata: Metadata = {
  title: "Shipping Policy",
  description:
    "Review JQD Group order processing, delivery timing, tracking, international duties, and shipping support.",
  alternates: { canonical: "/shipping" },
};

export default function ShippingPage() {
  return (
    <PolicyPage
      title="Shipping Policy"
      intro="We aim to dispatch every order quickly and provide reliable tracking so you can shop with confidence."
      effectiveDate="January 1, 2026"
      contactDetails={[
        { label: "Shipping Support", value: "shipping@jqdgroup.com", href: "mailto:shipping@jqdgroup.com" },
      ]}
      sections={[
        {
          title: "Delivery",
          paragraphs: [DELIVERY_RANGE, FREE_SHIPPING_OVER_250],
        },
        {
          title: "Tracking and Notifications",
          paragraphs: [
            "When your order ships, we send a confirmation email with tracking details. Tracking updates may take up to 24 hours to appear after label creation.",
          ],
        },
        {
          title: "Address Accuracy and Delivery Issues",
          bullets: [
            "Customers are responsible for entering complete and accurate shipping details.",
            "If a package is returned due to an incorrect address, re-shipping fees may apply.",
            "If a package is marked delivered but not received, contact us within 5 days so we can assist with a carrier claim.",
          ],
        },
        {
          title: "Duties and Taxes",
          paragraphs: [
            DUTIES_LINE,
          ],
        },
      ]}
    />
  );
}
