import PolicyPage from "@/components/trust/PolicyPage";

export const metadata = {
  title: "FAQs — JQJ Group",
};

export default function FaqsPage() {
  return (
    <PolicyPage
      title="Frequently Asked Questions"
      intro="Find quick answers about ordering, shipping, returns, and product care."
      effectiveDate="January 1, 2026"
      contactDetails={[
        { label: "Need Help", value: "support@jqjgroup.com", href: "mailto:support@jqjgroup.com" },
      ]}
      sections={[
        {
          title: "Orders & Payments",
          bullets: [
            "How do I know my order is confirmed? — You will receive an order confirmation email shortly after checkout.",
            "Which payment methods are accepted? — We accept secure online checkout options shown at checkout, including card payments and approved alternatives.",
            "Can I update an order after placing it? — Contact support immediately; we can only make changes before fulfillment starts.",
          ],
        },
        {
          title: "Shipping & Delivery",
          bullets: [
            "When will my order ship? — Most in-stock orders ship within 1–3 business days.",
            "Do you ship internationally? — Yes, where available. Delivery timing varies by destination and customs processing.",
            "How do I track my package? — Tracking details are sent by email when your label is created.",
          ],
        },
        {
          title: "Returns, Resizes & Exchanges",
          bullets: [
            "Can I return my item? — Eligible returns are accepted within 14 days of delivery.",
            "Can I exchange for a different size? — Yes, eligible exchange and resize requests are accepted within 30 days.",
            "Are all items returnable? — Final sale, custom, and personalized pieces are excluded.",
          ],
        },
        {
          title: "Product Care & Materials",
          bullets: [
            "Will natural stones look exactly like the photos? — Each stone is unique, so color and pattern may vary slightly.",
            "How should I care for my jewelry? — Keep pieces dry, avoid chemicals, and store separately to reduce wear.",
            "Do you offer repairs? — Please contact support with photos and order details so we can assess available repair options.",
          ],
        },
      ]}
    />
  );
}
