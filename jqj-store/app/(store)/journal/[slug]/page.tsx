import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JournalArticle from "@/components/journal/JournalArticle";
import { JOURNAL_POSTS, getJournalPost } from "@/data/journal";

// Unknown slugs must stay unmatched. In production, notFound() inside a
// matched dynamic segment is served as an empty __next_error__ document
// instead of app/not-found.tsx. Every published note is known at build.
export const dynamicParams = false;

export function generateStaticParams() {
  return JOURNAL_POSTS.map((post) => ({ slug: post.slug }));
}

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  const post = getJournalPost(params.slug);
  if (!post) {
    return {
      title: { absolute: "Journal — Jewellery Quintessential" },
      robots: {
        index: false,
        follow: false,
        googleBot: { index: false, follow: false },
      },
      alternates: { canonical: null },
    };
  }

  return {
    title: { absolute: post.metaTitle },
    description: post.metaDescription,
    alternates: { canonical: `/journal/${post.slug}` },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    },
    openGraph: {
      title: post.metaTitle,
      description: post.metaDescription,
      url: `/journal/${post.slug}`,
    },
    twitter: {
      title: post.metaTitle,
      description: post.metaDescription,
    },
  };
}

export default function JournalArticlePage({
  params,
}: {
  params: { slug: string };
}) {
  const post = getJournalPost(params.slug);
  if (!post) notFound();
  return <JournalArticle post={post} />;
}
