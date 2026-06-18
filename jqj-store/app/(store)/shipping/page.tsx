import PolicyPage from "@/components/trust/PolicyPage";

export const metadata = {
  title: "Shipping Policy — JQJ Group",
};

export default function ShippingPage() {
  return (
    <PolicyPage
      title="Shipping Policy"
      intro="We aim to dispatch every order quickly and provide reliable tracking so you can shop with confidence."
      effectiveDate="January 1, 2026"
      contactDetails={[
        { label: "Shipping Support", value: "shipping@jqjgroup.com", href: "mailto:shipping@jqjgroup.com" },
      ]}
      sections={[
        {
          title: "Processing Times",
          bullets: [
            "In-stock orders are typically processed within 1–3 business days.",
            "Custom, resized, or made-to-order pieces may require 5–10 business days before shipment.",
            "Orders placed on weekends or holidays begin processing on the next business day.",
          ],
        },
        {
          title: "Delivery Timelines",
          bullets: [
            "Domestic standard shipping: 3–7 business days after dispatch.",
            "Domestic expedited shipping: 1–3 business days after dispatch.",
            "International shipping (where available): 7–14 business days, excluding customs delays.",
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
          title: "Duties and Taxes",
          paragraphs: [
            "International orders may be subject to import duties, taxes, or customs fees charged by destination authorities. These charges are the buyer's responsibility unless otherwise stated at checkout.",
          ],
        },
      ]}
    />
  );
}
