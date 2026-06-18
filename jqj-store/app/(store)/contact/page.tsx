import PolicyPage from "@/components/trust/PolicyPage";

export const metadata = {
  title: "Contact Us — JQJ Group",
};

export default function ContactPage() {
  return (
    <PolicyPage
      title="Contact Us"
      intro="Our support team is available to help with orders, product questions, and post-purchase care."
      effectiveDate="January 1, 2026"
      contactDetails={[
        { label: "Customer Care", value: "support@jqjgroup.com", href: "mailto:support@jqjgroup.com" },
        { label: "Phone", value: "Available on request via email support." },
        { label: "Mailing Address", value: "Available upon verified order-related request." },
        { label: "Support Hours", value: "Monday-Friday, 9:00 AM-5:00 PM (UTC+8)." },
      ]}
      sections={[
        {
          title: "Before You Reach Out",
          bullets: [
            "Include your order number for shipping, returns, or exchange requests.",
            "For bracelet sizing support, share your wrist measurement and preferred fit style.",
            "For product questions, include the product name or link so we can respond faster.",
          ],
        },
        {
          title: "Response Times",
          bullets: [
            "General inquiries: within 1–2 business days.",
            "Order support (shipping/returns): within 1 business day.",
            "Weekend and holiday messages are answered on the next business day.",
          ],
        },
        {
          title: "Business and Press Inquiries",
          paragraphs: [
            "For wholesale, collaborations, media, or partnerships, contact us at press@jqjgroup.com and include your company details and request summary.",
          ],
        },
      ]}
    />
  );
}
