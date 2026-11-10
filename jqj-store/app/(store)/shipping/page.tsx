import type { Metadata } from "next";
import PolicyPage from "@/components/trust/PolicyPage";
import {
  DISPATCH_BUSINESS_DAYS_MAX,
  DISPATCH_BUSINESS_DAYS_MIN,
  RETURNS_DAYS,
  TRANSIT_DAYS_MAX,
  TRANSIT_DAYS_MIN,
} from "@/lib/policy";
import { FREE_SHIPPING_THRESHOLD_USD } from "@/lib/shipping";

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
          title: "Shipping Cost",
          bullets: [
            `Free shipping on orders over $${FREE_SHIPPING_THRESHOLD_USD}.`,
          ],
        },
        {
          title: "Processing Times",
          bullets: [
            `In-stock orders are typically processed within ${DISPATCH_BUSINESS_DAYS_MIN}–${DISPATCH_BUSINESS_DAYS_MAX} business days.`,
            "Custom, resized, or made-to-order pieces may require 5–10 business days before shipment.",
            "Orders placed on weekends or holidays begin processing on the next business day.",
          ],
        },
        {
          title: "Delivery Timelines",
          bullets: [
            `Domestic standard shipping: typically ${TRANSIT_DAYS_MIN}–${TRANSIT_DAYS_MAX} days after dispatch.`,
            "Domestic expedited shipping: 1–3 business days after dispatch.",
            `International shipping (where available): typically ${TRANSIT_DAYS_MIN}–${TRANSIT_DAYS_MAX} days, excluding customs delays.`,
          ],
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
          title: "Returns",
          bullets: [
            `Returns are accepted within ${RETURNS_DAYS} days of delivery. Customers pay return shipping.`,
          ],
        },
        {
          title: "Duties and Taxes",
          paragraphs: [
            "International orders may be subject to import duties, taxes, or customs fees charged by destination authorities. These charges are the buyer's responsibility unless otherwise stated at checkout.",
          ],
        },
      ]}
    />
  );
}
