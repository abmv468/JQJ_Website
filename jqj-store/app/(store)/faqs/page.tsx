import PolicyPage from "@/components/trust/PolicyPage";
import type { Metadata } from "next";
import { RETURNS_DAYS } from "@/lib/policy";
import { jsonLd } from "@/lib/seo";

export const metadata = {
  title: "Jewelry FAQs",
  description:
    "Answers about JQD Group orders, payment, shipping, returns, resizing, natural stone jewelry care, and repairs.",
  alternates: { canonical: "/faqs" },
};

const faqSections = [
  {
    title: "Orders & Payments",
    questions: [
      {
        question: "How do I know my order is confirmed?",
        answer: "You will receive an order confirmation email shortly after checkout.",
      },
      {
        question: "Which payment methods are accepted?",
        answer:
          "We accept secure online checkout options shown at checkout, including card payments and approved alternatives.",
      },
      {
        question: "Can I update an order after placing it?",
        answer:
          "Contact support immediately; we can only make changes before fulfillment starts.",
      },
    ],
  },
  {
    title: "Shipping & Delivery",
    questions: [
      {
        question: "When will my order ship?",
        answer: "Most in-stock orders ship within 1-3 business days.",
      },
      {
        question: "Do you ship internationally?",
        answer:
          "Yes, where available. Delivery timing varies by destination and customs processing.",
      },
      {
        question: "How do I track my package?",
        answer: "Tracking details are sent by email when your label is created.",
      },
    ],
  },
  {
    title: "Returns, Resizes & Exchanges",
    questions: [
      {
        question: "Can I return my item?",
        answer: `Eligible returns are accepted within ${RETURNS_DAYS} days of delivery. Customers pay return shipping.`,
      },
      {
        question: "Can I exchange for a different size?",
        answer: `Yes. Eligible bracelet exchange and resize requests are accepted within ${RETURNS_DAYS} days of delivery.`,
      },
      {
        question: "Are all items returnable?",
        answer: "Final sale, custom, and personalized pieces are excluded.",
      },
    ],
  },
  {
    title: "Product Care & Materials",
    questions: [
      {
        question: "Will natural stones look exactly like the photos?",
        answer:
          "Each stone is unique, so color and pattern may vary slightly.",
      },
      {
        question: "How should I care for my jewelry?",
        answer:
          "Keep pieces dry, avoid chemicals, and store separately to reduce wear.",
      },
      {
        question: "Do you offer repairs?",
        answer:
          "Please contact support with photos and order details so we can assess available repair options.",
      },
    ],
  },
] as const;

export default function FaqsPage() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqSections.flatMap((section) =>
      section.questions.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      }))
    ),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema) }}
      />
      <PolicyPage
        title="Frequently Asked Questions"
        intro="Find quick answers about ordering, shipping, returns, and product care."
        effectiveDate="January 1, 2026"
        contactDetails={[
          { label: "Need Help", value: "support@jqdgroup.com", href: "mailto:support@jqdgroup.com" },
        ]}
        sections={faqSections.map((section) => ({
          title: section.title,
          bullets: section.questions.map(
            (item) => `${item.question} - ${item.answer}`
          ),
        }))}
      />
    </>
  );
}
