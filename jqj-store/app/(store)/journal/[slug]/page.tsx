import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JournalArticle from "@/components/journal/JournalArticle";
import { JOURNAL_POSTS, getJournalPost } from "@/data/journal";

export function generateStaticParams() {
  return JOURNAL_POSTS.map((post) => ({ slug: post.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const post = getJournalPost(params.slug);
  if (!post) {
    return {
      title: { absolute: "Journal — Jewellery Quintessential" },
      robots: {
        index: false,
        follow: false,
        googleBot: { index: false, follow: false },
      },
    };
  }

  return {
    title: { absolute: post.metaTitle },
    description: post.metaDescription,
    alternates: { canonical: `/journal/${post.slug}` },
    robots: {
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    },
  };
}

export default function JournalArticlePage({ params }: { params: { slug: string } }) {
  const post = getJournalPost(params.slug);
  if (!post) notFound();
  return <JournalArticle post={post} />;
}
