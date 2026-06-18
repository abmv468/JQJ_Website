import PolicyPage from "@/components/trust/PolicyPage";

export const metadata = {
  title: "Returns, Resizes & Exchanges — JQJ Group",
};

export default function ReturnsPage() {
  return (
    <PolicyPage
      title="Returns, Resizes & Exchanges"
      intro="If something is not the right fit, we are here to help with fair and transparent return and exchange support."
      effectiveDate="January 1, 2026"
      contactDetails={[
        { label: "Returns Team", value: "returns@jqjgroup.com", href: "mailto:returns@jqjgroup.com" },
      ]}
      sections={[
        {
          title: "Eligibility Window",
          bullets: [
            "Return requests must be submitted within 14 days of delivery.",
            "Exchange or resize requests should be submitted within 30 days of delivery.",
            "Items must be unused, unaltered, and returned with original packaging.",
          ],
        },
        {
          title: "Non-Returnable Items",
          bullets: [
            "Final sale or clearance items marked as non-returnable.",
            "Custom, personalized, or made-to-order pieces.",
            "Items showing wear, damage, or alterations not performed by JQJ Group.",
            "Gift cards and digital products.",
          ],
        },
        {
          title: "How to Start a Return or Exchange",
          paragraphs: [
            "Email our returns team with your order number and reason for the request. If approved, we will provide next steps and return instructions.",
          ],
          bullets: [
            "Customers are responsible for return shipping unless the item arrived damaged or incorrect.",
            "Use a trackable shipping service and keep proof of shipment until the return is processed.",
          ],
        },
        {
          title: "Refund Timing",
          paragraphs: [
            "After we receive and inspect your return, approved refunds are issued to the original payment method within 5–10 business days.",
            "Original shipping fees are non-refundable unless required by law or due to our fulfillment error.",
          ],
        },
      ]}
    />
  );
}
