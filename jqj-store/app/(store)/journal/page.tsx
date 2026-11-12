import type { Metadata } from "next";
import JournalIndex from "@/components/journal/JournalIndex";
import { JOURNAL_INTRO, parseJournalCategory } from "@/data/journal";

export const metadata: Metadata = {
  title: { absolute: "Journal — Jewellery Quintessential" },
  description: `${JOURNAL_INTRO.dek} ${JOURNAL_INTRO.fictional}`,
  alternates: { canonical: "/journal" },
};

export default function JournalPage({
  searchParams,
}: {
  searchParams: { category?: string; q?: string };
}) {
  const category = parseJournalCategory(searchParams.category);
  const initialQuery = searchParams.q ?? "";

  return <JournalIndex key={category} category={category} initialQuery={initialQuery} />;
}
