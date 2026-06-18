import PolicyPage from "@/components/trust/PolicyPage";

export const metadata = {
  title: "Terms & Conditions — JQJ Group",
};

export default function TermsPage() {
  return (
    <PolicyPage
      title="Terms & Conditions"
      intro="By using our website or purchasing from JQJ Group, you agree to these terms. Please review them before placing an order."
      effectiveDate="January 1, 2026"
      contactDetails={[
        { label: "Email", value: "support@jqjgroup.com", href: "mailto:support@jqjgroup.com" },
      ]}
      sections={[
        {
          title: "Use of Our Website",
          paragraphs: [
            "You agree to use this website for lawful purposes only and not to interfere with site performance, security, or other customers' experiences.",
            "We may update website content, features, and policies at any time without prior notice.",
          ],
        },
        {
          title: "Orders, Pricing, and Availability",
          bullets: [
            "All orders are subject to acceptance, inventory availability, and payment verification.",
            "Prices are listed in USD and may change without notice.",
            "We reserve the right to cancel or limit any order if pricing, availability, or fraud concerns arise.",
            "Product images are representative; natural stones and handcrafted pieces may vary slightly.",
          ],
        },
        {
          title: "Payments and Billing",
          paragraphs: [
            "Payment must be completed through approved checkout methods. You are responsible for providing accurate billing and shipping information.",
            "If a payment is declined or flagged for verification, order processing may be delayed or canceled.",
          ],
        },
        {
          title: "Intellectual Property",
          paragraphs: [
            "All website content, including text, imagery, branding, and product descriptions, belongs to JQJ Group or its licensors and may not be copied or reused without written permission.",
          ],
        },
        {
          title: "Liability and Disputes",
          paragraphs: [
            "To the maximum extent permitted by law, JQJ Group is not liable for indirect, incidental, or consequential damages related to your use of this website or products.",
            "Any disputes should first be submitted to our support team so we can attempt resolution in good faith.",
          ],
        },
      ]}
      disclaimer="These terms are for general business transparency and are not legal advice."
    />
  );
}
