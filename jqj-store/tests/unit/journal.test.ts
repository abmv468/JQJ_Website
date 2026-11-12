import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  JOURNAL_ARTICLE_FICTIONAL,
  JOURNAL_CATEGORIES,
  JOURNAL_INTRO,
  JOURNAL_POSTS,
  filterJournalPosts,
  getJournalPost,
  journalEmptyMessage,
  journalFilterStatus,
  parseJournalCategory,
} from "@/data/journal";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const BANNED =
  /handmade|hand-finished|handfinished|atelier|china|handcrafted|artisanal|artisan|craftsmanship|crafted/i;

const JOURNAL_SOURCES = [
  "data/journal.ts",
  "components/journal/JournalIndex.tsx",
  "components/journal/JournalArticle.tsx",
  "app/(store)/journal/page.tsx",
  "app/(store)/journal/[slug]/page.tsx",
];

function source(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("journal catalogue", () => {
  const header = source("components/layout/Header.tsx");
  const footer = source("components/layout/Footer.tsx");
  const css = source("app/globals.css");
  const index = source("components/journal/JournalIndex.tsx");
  const article = source("components/journal/JournalArticle.tsx");
  const indexPage = source("app/(store)/journal/page.tsx");
  const articlePage = source("app/(store)/journal/[slug]/page.tsx");
  const journalSource = JOURNAL_SOURCES.map(source).join("\n");

  it("pins the index and featured article routes", () => {
    expect(indexPage).toContain('canonical: "/journal"');
    expect(articlePage).toContain("notFound()");
    expect(articlePage).toContain("generateStaticParams");
    expect(getJournalPost("caring-for-natural-stone")?.title).toBe("Caring for natural stone");
    expect(getJournalPost("not-a-note")).toBeUndefined();
  });

  it("places Journal after Necklaces and marks it current on journal paths", () => {
    const navStart = header.indexOf("const navLinks = [");
    const navEnd = header.indexOf("];", navStart);
    const labels = [...header.slice(navStart, navEnd).matchAll(/label: "([^"]+)"/g)].map((match) => match[1]);
    expect(labels).toEqual(["New", "Limited Edition", "Bracelets", "Necklaces", "Journal"]);
    expect(header).toContain('{ label: "Journal", href: "/journal" }');
    expect(header.match(/navLinks\.map/g)).toHaveLength(2);
    expect(header).toContain('pathname === "/journal" || pathname.startsWith("/journal/")');
    expect(header).toContain('className={`nav-link${current ? " is-current" : ""}`}');
    expect(header).toContain('aria-current={current ? "page" : undefined}');
    expect(header).toContain('className={current ? "mobile-nav-current" : undefined}');
    expect(header).not.toMatch(/key:\s*"journal"/);
    expect(css).toContain(".nav-link.is-current");
    expect(css).toContain(".nav-link.is-current::after");
    expect(css).toMatch(/\.nav-link\.is-current::after\s*\{[^}]*opacity:\s*1/);
    expect(css).toContain(".mobile-nav-current");
  });

  it("keeps Header Pearl Collective and the footer ritual line, with no Journal footer link", () => {
    expect(header).toContain('{ label: "Pearl Collective", href: queryHref("necklaces", "Pearl") }');
    expect(header.match(/Pearl Collective/g)).toHaveLength(1);
    expect(footer).toContain("Natural stone pieces designed for everyday ritual.");
    expect(footer).not.toContain("/journal");
    expect(footer).not.toMatch(/\bJournal\b/);
    expect(footer).toContain('placeholder="Email address"');
    expect(footer).toContain('className="input-field"');
    expect(footer).toContain('className="btn-gold w-full"');
  });

  it("pins the catalogue search field and the seven category labels", () => {
    expect(JOURNAL_CATEGORIES.map((item) => item.label)).toEqual([
      "All",
      "Care",
      "Stones",
      "Gifting",
      "Dressing",
      "Meaning",
      "History",
    ]);
    expect(index).toContain('placeholder="Search the Journal"');
    expect(index).toContain('aria-label="Journal categories"');
    expect(index).toContain('role="search"');
    const form = index.slice(index.indexOf('role="search"'), index.indexOf("</form>"));
    expect(form).not.toContain("<button");
    expect(form).not.toContain("Search className");
    expect(css).toMatch(/\.journal-search\s*\{[^}]*border-radius:\s*0/);
    expect(css).toContain(".journal-category.is-current");
    expect(index).not.toContain("rounded-full");
    expect(index).not.toContain("minutes");
  });

  it("lists the four fictional notes and filters Care without hiding search", () => {
    expect(JOURNAL_INTRO.dek).toBe(
      "Notes on natural stone, care, and dressing pieces designed in Hong Kong."
    );
    expect(JOURNAL_INTRO.fictional).toBe("Example posts below are fictional, for layout only.");
    expect(JOURNAL_ARTICLE_FICTIONAL).toBe("Example post — fictional");
    expect(index).toContain("{JOURNAL_INTRO.fictional}");
    expect(article).toContain("{JOURNAL_ARTICLE_FICTIONAL}");

    expect(JOURNAL_POSTS.map((post) => [post.title, post.displayDate, post.category])).toEqual([
      ["Caring for natural stone", "12 November 2026", "care"],
      ["Designed in Hong Kong", "5 November 2026", "history"],
      ["Materials sourced from around the world", "29 October 2026", "stones"],
      ["Dressing stone for everyday ritual", "22 October 2026", "dressing"],
    ]);

    expect(filterJournalPosts(JOURNAL_POSTS, { category: "all", query: "" })).toHaveLength(4);
    const care = filterJournalPosts(JOURNAL_POSTS, { category: "care", query: "" });
    expect(care.map((post) => post.title)).toEqual(["Caring for natural stone"]);
    expect(journalFilterStatus("care")).toBe("Showing notes in Care.");
    expect(index).toContain("{status}");
    expect(index).toContain('id="journal-search"');
    expect(filterJournalPosts(JOURNAL_POSTS, { category: "gifting", query: "" })).toEqual([]);
    expect(filterJournalPosts(JOURNAL_POSTS, { category: "meaning", query: "" })).toEqual([]);
    expect(parseJournalCategory("care")).toBe("care");
    expect(parseJournalCategory(undefined)).toBe("all");
  });

  it("filters notes by title and dek and keeps the approved care article", () => {
    expect(
      filterJournalPosts(JOURNAL_POSTS, { category: "all", query: "soft cloth" }).map((post) => post.slug)
    ).toEqual(["caring-for-natural-stone"]);
    expect(filterJournalPosts(JOURNAL_POSTS, { category: "history", query: "soft cloth" })).toEqual([]);
    expect(filterJournalPosts(JOURNAL_POSTS, { category: "all", query: "no-such-note" })).toEqual([]);
    expect(journalEmptyMessage("all", "no-such-note")).toBe("No notes match this search.");
    expect(journalEmptyMessage("gifting", "")).toBe("No notes in Gifting.");
    expect(index).toContain("journalEmptyMessage(category, trimmed)");

    const care = getJournalPost("caring-for-natural-stone");
    expect(care?.body?.map((block) => block.text)).toEqual([
      "A soft cloth is enough for most days. After wearing, wipe the stone and the metal, then let the piece sit in the open air before you put it away.",
      "Avoid long soaks, ultrasonic cleaners, and household chemicals. Natural stone can be porous, and a quiet routine will keep it looking as it should.",
      "Wipe, rest, and put it away. That is the whole of the daily care.",
      "If a clasp or thread needs attention, write to us from the Contact page. We would rather look at a piece early than leave it to wear unevenly.",
      "These notes are for layout only. They are not a published Journal post, and they do not replace the care page already on the site.",
    ]);
    expect(article).toContain('href="/journal"');
    expect(article).toContain("Back to Journal");
    expect(article).toContain(">Journal</Link>");
    expect(css).toContain("animation: journal-fade 0.65s");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.journal-main\s*\{[^}]*animation:\s*none/);
  });

  it("keeps banned words out of Journal content", () => {
    expect(journalSource).not.toMatch(BANNED);
    expect(journalSource).not.toMatch(/Quintessence/);
    expect(journalSource).not.toContain("楷");
    expect(journalSource).not.toMatch(/\bChina\b/);
    expect(journalSource).toContain("Designed in Hong Kong");
    expect(journalSource).toContain("materials sourced from around the world");
  });
});
