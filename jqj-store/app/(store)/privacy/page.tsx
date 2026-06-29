import PolicyPage from "@/components/trust/PolicyPage";

export const metadata = {
  title: "Privacy Policy — JQD Group",
};

export default function PrivacyPage() {
  return (
    <PolicyPage
      title="Privacy Policy"
      intro="We value your trust and use your information responsibly to fulfill orders, provide support, and improve your shopping experience."
      effectiveDate="January 1, 2026"
      contactDetails={[
        { label: "Email", value: "privacy@jqdgroup.com", href: "mailto:privacy@jqdgroup.com" },
        { label: "Support", value: "support@jqdgroup.com", href: "mailto:support@jqdgroup.com" },
      ]}
      sections={[
        {
          title: "Information We Collect",
          paragraphs: [
            "We collect details you provide when placing orders, creating an account, subscribing to updates, or contacting support. This may include your name, email, phone number, shipping address, and order notes.",
            "We also collect limited technical data such as browser type, device information, IP address, and onsite activity through cookies and analytics tools.",
          ],
        },
        {
          title: "How We Use Your Data",
          bullets: [
            "Process and deliver orders, including payment verification and shipping updates.",
            "Respond to inquiries, returns, and account-related requests.",
            "Send transactional emails and optional marketing updates when you opt in.",
            "Detect fraud, secure our services, and comply with legal obligations.",
            "Improve website performance, product offerings, and customer support quality.",
          ],
        },
        {
          title: "How We Share Information",
          paragraphs: [
            "We share data only with trusted service providers needed to operate our store, such as payment processors, shipping carriers, email platforms, and fraud-prevention tools.",
            "We do not sell personal information. Service providers may access data only as required to perform their services for JQD Group.",
          ],
        },
        {
          title: "Cookies & Tracking",
          paragraphs: [
            "Cookies help us keep your cart active, remember your preferences, and understand how our site is used.",
            "You can control cookies through your browser settings, but some store features may not function correctly if cookies are disabled.",
          ],
        },
        {
          title: "Your Choices & Rights",
          bullets: [
            "Request access to, correction of, or deletion of your personal data.",
            "Unsubscribe from marketing emails at any time via the link in each message.",
            "Request account closure by contacting our support team.",
          ],
        },
      ]}
      disclaimer="This policy is provided for transparency and business operations and does not constitute legal advice."
    />
  );
}
