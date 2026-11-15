"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  JOURNAL_CATEGORIES,
  JOURNAL_INTRO,
  JOURNAL_POSTS,
  filterJournalPosts,
  journalCategoryHref,
  journalEmptyMessage,
  journalFilterStatus,
  type JournalCatalogueCategory,
} from "@/data/journal";

type JournalIndexProps = {
  category: JournalCatalogueCategory;
  initialQuery: string;
};

export default function JournalIndex({ category, initialQuery }: JournalIndexProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const trimmed = query.trim();
  const notes = filterJournalPosts(JOURNAL_POSTS, { category, query: trimmed });
  const status = journalFilterStatus(category);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (category !== "all" && category !== "unknown") params.set("category", category);
    if (trimmed) params.set("q", trimmed);
    const search = params.toString();
    router.replace(search ? `/journal?${search}` : "/journal", { scroll: false });
  }

  return (
    <div className="journal-main">
      <div className="container-site">
        <header className="journal-intro">
          <p className="eyebrow">{JOURNAL_INTRO.eyebrow}</p>
          <h1 className="section-title">{JOURNAL_INTRO.title}</h1>
          <p className="journal-intro-line">{JOURNAL_INTRO.dek}</p>
        </header>

        <div className="journal-tools">
          <form role="search" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="journal-search">
              Search the Journal
            </label>
            <input
              id="journal-search"
              className="journal-search"
              type="search"
              name="q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the Journal"
              autoComplete="off"
              spellCheck={false}
            />
          </form>
          <ul className="journal-categories" aria-label="Journal categories">
            {JOURNAL_CATEGORIES.map((item) => {
              const current = item.slug === category;
              return (
                <li key={item.slug}>
                  <Link
                    href={journalCategoryHref(item.slug)}
                    className={`journal-category${current ? " is-current" : ""}`}
                    aria-current={current ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          {status ? <p className="journal-filter-status">{status}</p> : null}
        </div>

        <section className="journal-list" aria-label="Journal notes">
          {notes.length === 0 ? (
            <p className="journal-empty">{journalEmptyMessage(category, trimmed)}</p>
          ) : (
            notes.map((post, index) => {
              const featured = index === 0;
              const href = `/journal/${post.slug}`;
              return (
                <article key={post.slug} className={featured ? "journal-featured" : "journal-row"}>
                  <p className="journal-date">
                    <time dateTime={post.dateTime}>{post.displayDate}</time>
                  </p>
                  <h2 className={featured ? "journal-featured-title" : "journal-row-title"}>
                    <Link href={href}>{post.title}</Link>
                  </h2>
                  <p className="journal-dek">{post.dek}</p>
                  <Link className="journal-read" href={href}>
                    Read the note
                  </Link>
                </article>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
