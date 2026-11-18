import type { Metadata } from "next";
import JournalIndex from "@/components/journal/JournalIndex";
import { JOURNAL_INTRO, parseJournalCategory } from "@/data/journal";

const JOURNAL_INDEX_TITLE = "Journal — Jewellery Quintessential";

export const metadata: Metadata = {
  title: { absolute: JOURNAL_INDEX_TITLE },
  description: JOURNAL_INTRO.dek,
  alternates: { canonical: "/journal" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    title: JOURNAL_INDEX_TITLE,
    description: JOURNAL_INTRO.dek,
    url: "/journal",
  },
  twitter: {
    title: JOURNAL_INDEX_TITLE,
    description: JOURNAL_INTRO.dek,
  },
};

export default function JournalPage({
  searchParams,
}: {
  searchParams: { category?: string; q?: string };
}) {
  const category = parseJournalCategory(searchParams.category);
  const initialQuery = searchParams.q ?? "";

  return (
    <JournalIndex
      key={category}
      category={category}
      initialQuery={initialQuery}
    />
  );
}
