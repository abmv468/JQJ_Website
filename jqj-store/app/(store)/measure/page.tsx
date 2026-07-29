import type { Metadata } from "next";
import PolicyPage from "@/components/trust/PolicyPage";

export const metadata: Metadata = {
  title: "Bracelet Wrist Size Guide",
  description:
    "Measure your wrist and choose a close, everyday, or relaxed bracelet fit before ordering natural stone jewelry from JQD Group.",
  alternates: { canonical: "/measure" },
};

export default function MeasurePage() {
  return (
    <PolicyPage
      title="Wrist Size Guide"
      intro="A comfortable bracelet starts with an accurate wrist measurement. Use this guide before placing your order, and include your preference at checkout."
      effectiveDate="July 28, 2026"
      contactDetails={[
        {
          label: "Sizing Help",
          value: "support@jqdgroup.com",
          href: "mailto:support@jqdgroup.com",
        },
      ]}
      sections={[
        {
          title: "Measure Your Wrist",
          bullets: [
            "Wrap a flexible measuring tape, string, or strip of paper around your wrist where you would normally wear a bracelet.",
            "Keep it comfortably close to the skin without pulling it tight.",
            "Mark where the ends meet, then measure the length against a ruler in inches or centimeters.",
          ],
        },
        {
          title: "Choose Your Fit",
          bullets: [
            "For a close fit, provide your exact wrist measurement.",
            "For an everyday fit, add approximately 0.5 inches or 1.25 centimeters.",
            "For a relaxed fit, add approximately 1 inch or 2.5 centimeters.",
          ],
        },
        {
          title: "Include Your Preference",
          paragraphs: [
            "Enter your wrist measurement and preferred fit in the sizing field on the product page. If you need help choosing a size, contact support before placing your order.",
          ],
        },
      ]}
    />
  );
}