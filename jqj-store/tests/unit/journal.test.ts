import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateMetadata } from "@/app/(store)/journal/[slug]/page";
import {
  JOURNAL_CATEGORIES,
  JOURNAL_INTRO,
  JOURNAL_POSTS,
  filterJournalPosts,
  getJournalPost,
  journalEmptyMessage,
  journalFilterStatus,
  parseJournalCategory,
  type JournalBlock,
} from "@/data/journal";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const BANNED =
  /handmade|hand-finished|handfinished|atelier|china|handcrafted|artisanal|artisan|crafted/i;

const RETIRED_SLUGS = [
  "caring-for-natural-stone",
  "a-short-history-of-jewellery-as-everyday-ritual",
  "materials-sourced-from-around-the-world",
  "dressing-stone-for-everyday-ritual",
  "designed-in-hong-kong",
] as const;

function blockText(block: JournalBlock): string {
  return block.type === "list" ? block.items.join("\n") : block.text;
}

function webpSize(file: Buffer): { width: number; height: number } {
  const chunk = file.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X") {
    return {
      width: 1 + file.readUIntLE(24, 3),
      height: 1 + file.readUIntLE(27, 3),
    };
  }
  if (chunk === "VP8 ") {
    const marker = file.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
    return {
      width: file.readUInt16LE(marker + 3) & 0x3fff,
      height: file.readUInt16LE(marker + 5) & 0x3fff,
    };
  }
  const bits = file.readUInt32LE(21);
  return {
    width: (bits & 0x3fff) + 1,
    height: ((bits >> 14) & 0x3fff) + 1,
  };
}

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
    expect(getJournalPost("how-to-clean-a-crystal")?.title).toBe(
      "How to clean a crystal without damaging it"
    );
    expect(getJournalPost("not-a-note")).toBeUndefined();
    for (const slug of RETIRED_SLUGS) {
      expect(getJournalPost(slug), slug).toBeUndefined();
    }
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

  it("lists the four notes and filters Care without hiding search", () => {
    expect(JOURNAL_INTRO.dek).toBe(
      "Notes on natural stone, care, and dressing pieces for everyday ritual."
    );
    expect(JOURNAL_INTRO).not.toHaveProperty("fictional");
    expect(index).not.toContain("fictional");
    expect(index).not.toContain("Example posts");
    expect(article).not.toContain("fictional");
    expect(article).not.toContain("Example post");
    expect(indexPage).not.toContain("fictional");
    expect(articlePage).not.toContain("JOURNAL_ARTICLE_FICTIONAL");
    expect(source("data/journal.ts")).not.toContain("JOURNAL_ARTICLE_FICTIONAL");

    const eyebrow = article.slice(
      article.indexOf('className="eyebrow journal-article-eyebrow"'),
      article.indexOf("<h1")
    );
    expect(eyebrow).toContain("<time dateTime={post.dateTime}>{post.displayDate}</time>");
    expect(eyebrow).not.toContain("·");
    expect(eyebrow).not.toMatch(/byline|author/i);

    expect(JOURNAL_POSTS.map((post) => [post.title, post.displayDate, post.dateTime, post.category])).toEqual([
      ["How to clean a crystal without damaging it", "12 November 2026", "2026-11-12", "care"],
      [
        "Moonstone's blue sheen: how it differs from labradorite",
        "12 November 2026",
        "2026-11-12",
        "stones",
      ],
      ["Jewellery for a long day at your desk", "12 November 2026", "2026-11-12", "dressing"],
      [
        "The Victorian fascination with crystal jewellery",
        "12 November 2026",
        "2026-11-12",
        "history",
      ],
    ]);
    expect(JOURNAL_POSTS[1]?.title).not.toContain("\u2019");

    expect(filterJournalPosts(JOURNAL_POSTS, { category: "all", query: "" })).toHaveLength(4);
    const care = filterJournalPosts(JOURNAL_POSTS, { category: "care", query: "" });
    expect(care.map((post) => post.slug)).toEqual(["how-to-clean-a-crystal"]);
    expect(journalFilterStatus("care")).toBe("Showing notes in Care.");
    expect(index).toContain("{status}");
    expect(index).toContain('id="journal-search"');
    expect(filterJournalPosts(JOURNAL_POSTS, { category: "gifting", query: "" })).toEqual([]);
    expect(filterJournalPosts(JOURNAL_POSTS, { category: "meaning", query: "" })).toEqual([]);
    expect(parseJournalCategory("care")).toBe("care");
    expect(parseJournalCategory(undefined)).toBe("all");
  });

  it("filters notes by title and dek and keeps the approved care article", () => {
    expect(source("data/journal.ts")).toContain("`${post.title}\\n${post.dek}`");
    expect(
      filterJournalPosts(JOURNAL_POSTS, { category: "all", query: "without damaging" }).map((post) => post.slug)
    ).toEqual(["how-to-clean-a-crystal"]);
    expect(filterJournalPosts(JOURNAL_POSTS, { category: "history", query: "without damaging" })).toEqual([]);
    expect(filterJournalPosts(JOURNAL_POSTS, { category: "all", query: "soft cloth" })).toEqual([]);
    expect(filterJournalPosts(JOURNAL_POSTS, { category: "all", query: "microfibre" })).toEqual([]);
    expect(filterJournalPosts(JOURNAL_POSTS, { category: "all", query: "no-such-note" })).toEqual([]);
    expect(journalEmptyMessage("all", "no-such-note")).toBe("No notes match this search.");
    expect(journalEmptyMessage("gifting", "")).toBe("No notes in Gifting.");
    expect(index).toContain("journalEmptyMessage(category, trimmed)");

    const care = getJournalPost("how-to-clean-a-crystal");
    expect(care?.body?.filter((block) => block.type === "heading").map((block) => block.text)).toEqual([
      "Start with a dry clean",
      "When water is appropriate",
      "What to avoid",
      "Give each material its own attention",
      "A small habit after wearing",
    ]);
    expect(care?.body?.find((block) => block.type === "list")).toEqual({
      type: "list",
      items: [
        "Bleach, vinegar and acidic household cleaners.",
        "Alcohol-based cleaning products unless specifically confirmed safe for every component.",
        "Abrasive powders and polishing compounds.",
        "Ultrasonic cleaners, particularly for stones with inclusions, fractures, treatments or delicate settings.",
        "Steam cleaning and sudden temperature changes.",
        "Long periods of soaking, especially where stringing, adhesives or metal fittings are involved.",
      ],
    });
    expect(care?.body?.filter((block) => block.type === "quote")).toEqual([
      { type: "quote", text: "When in doubt, less is usually more." },
    ]);
    expect(
      care?.body
        ?.filter((block) => block.type !== "quote")
        .map(blockText)
        .join("\n")
    ).not.toContain("When in doubt, less is usually more.");
    expect(care?.body?.at(-1)).toEqual({ type: "quote", text: "When in doubt, less is usually more." });
    expect(article).toContain('className="journal-pull"');
    expect(article).toContain('className="journal-subhead"');
    expect(article).toContain('className="journal-article-list"');
    expect(article).toContain('className="journal-related"');
    expect(article.indexOf("journal-related")).toBeLessThan(article.indexOf("Back to Journal"));
    expect(article).toContain('href="/journal"');
    expect(article).toContain("Back to Journal");
    expect(article).toContain(">Journal</Link>");
    expect(css).toContain("animation: journal-fade 0.65s");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.journal-main\s*\{[^}]*animation:\s*none/);
  });

  it("pins SEO metadata, related links, and the history note", () => {
    const notes = [
      {
        slug: "how-to-clean-a-crystal",
        metaTitle: "How to clean a crystal without damage | Jewellery Quintessential",
        metaDescription:
          "A gentle approach begins with knowing what the stone can tolerate. Not every crystal belongs in water, and a soft, dry cloth is often enough.",
        related: [
          { label: "Care", href: "https://jqd.app/care" },
          { label: "Amethyst Bracelet XV", href: "https://jqd.app/products/amethyst-bracelet-xv" },
        ],
      },
      {
        slug: "moonstones-blue-sheen-and-labradorite",
        metaTitle: "Moonstone's blue sheen and labradorite | Jewellery Quintessential",
        metaDescription:
          "Moonstone and labradorite can share an atmospheric flash of colour, yet the way each stone holds light, and their mineral structures, are different.",
        related: [
          { label: "Labradorite Bracelet V", href: "https://jqd.app/products/labradorite-bracelet-v" },
          {
            label: "Labradorite Silver Pendant",
            href: "https://jqd.app/products/labradorite-silver-pendant",
          },
        ],
      },
      {
        slug: "jewellery-for-a-long-day-at-your-desk",
        metaTitle: "Jewellery for a long day at your desk | Jewellery Quintessential",
        metaDescription:
          "When jewellery accompanies hours of sitting, typing and moving, comfort is found in weight, proportion and quiet details, not in pieces that demand attention.",
        related: [
          { label: "Bracelets", href: "https://jqd.app/bracelets" },
          { label: "Necklaces", href: "https://jqd.app/necklaces" },
        ],
      },
      {
        slug: "victorian-fascination-with-crystal-jewellery",
        metaTitle: "Victorian fascination with crystals | Jewellery Quintessential",
        metaDescription:
          "Changing fashions, new technologies and an interest in symbolism helped make crystal and gemstone jewellery part of a wider culture of personal expression.",
        related: [
          { label: "Our story", href: "https://jqd.app/story" },
          { label: "Necklaces", href: "https://jqd.app/necklaces" },
        ],
      },
    ] as const;

    for (const note of notes) {
      const post = getJournalPost(note.slug);
      expect(post?.metaTitle).toBe(note.metaTitle);
      expect(post?.metaDescription).toBe(note.metaDescription);
      expect(post?.related).toEqual([...note.related]);
      expect(post?.metaTitle).not.toContain("— Journal —");
      expect(generateMetadata({ params: { slug: note.slug } })).toEqual({
        title: { absolute: note.metaTitle },
        description: note.metaDescription,
        alternates: { canonical: `/journal/${note.slug}` },
      });
    }

    expect(generateMetadata({ params: { slug: "caring-for-natural-stone" } })).toEqual({
      title: { absolute: "Journal — Jewellery Quintessential" },
    });
    expect(articlePage).toContain("post.metaTitle");
    expect(articlePage).toContain("post.metaDescription");
    expect(articlePage).not.toContain("— Journal — Jewellery Quintessential`");

    const stones = getJournalPost("moonstones-blue-sheen-and-labradorite");
    expect(stones?.body?.some((block) => block.type === "quote")).toBe(false);
    expect(getJournalPost("jewellery-for-a-long-day-at-your-desk")?.body?.some((block) => block.type === "quote")).toBe(
      false
    );

    const history = getJournalPost("victorian-fascination-with-crystal-jewellery");
    const historyText = history?.body?.map(blockText).join("\n") ?? "";
    const house = "\u6975\u6C23";
    expect(historyText).toContain(`Jewellery Quintessential \u00B7 ${house}`);
    expect(historyText.codePointAt(historyText.indexOf(house))).toBe(0x6975);
    expect(historyText.codePointAt(historyText.indexOf(house) + 1)).toBe(0x6c23);
    expect(historyText).not.toContain("\u6977");
    expect(historyText).toContain("craftsmanship");
    expect(history?.body?.filter((block) => block.type === "quote")).toEqual([
      {
        type: "quote",
        text: "People have long used stones and decorative objects to express something beyond appearance.",
      },
    ]);
    expect(
      history?.body?.filter(
        (block) =>
          block.type === "paragraph" &&
          block.text.includes(
            "people have long used stones and decorative objects to express something beyond appearance."
          )
      )
    ).toHaveLength(1);
    expect(history?.body?.at(-1)?.type).toBe("paragraph");
  });

  it("places one lead still after the dek and keeps the index typographic", () => {
    const stills = [
      {
        slug: "how-to-clean-a-crystal",
        src: "/journal/how-to-clean-a-crystal.webp",
        alt: "A polished natural-stone beaded bracelet on a folded soft cloth, with a dry brush at the edge, on a warm cream surface.",
      },
      {
        slug: "moonstones-blue-sheen-and-labradorite",
        src: "/journal/moonstones-blue-sheen-and-labradorite.webp",
        alt: "A milky moonstone cabochon with a soft blue under-surface glow beside a darker labradorite cabochon with a sharp electric-blue flash, on a warm cream surface.",
      },
      {
        slug: "jewellery-for-a-long-day-at-your-desk",
        src: "/journal/jewellery-for-a-long-day-at-your-desk.webp",
        alt: "A lightweight gemstone beaded bracelet on a nearly empty desk, with a closed book at the edge.",
      },
      {
        slug: "victorian-fascination-with-crystal-jewellery",
        src: "/journal/victorian-fascination-with-crystal-jewellery.webp",
        alt: "A natural rock-crystal point with one loose amethyst, on a warm cream surface.",
      },
    ] as const;

    for (const still of stills) {
      expect(getJournalPost(still.slug)?.still).toEqual({ src: still.src, alt: still.alt });
      const file = readFileSync(path.join(root, "public", still.src));
      expect(file.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(file.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(webpSize(file)).toEqual({ width: 2048, height: 1360 });
    }

    const dekAt = article.indexOf('className="journal-article-dek"');
    const stillAt = article.indexOf('className="journal-still"');
    const bodyAt = article.indexOf('className="journal-article-body"');
    expect(dekAt).toBeGreaterThan(-1);
    expect(stillAt).toBeGreaterThan(dekAt);
    expect(bodyAt).toBeGreaterThan(stillAt);
    expect(article).toContain("unoptimized");
    expect(article).not.toContain("<figcaption");
    expect(article).not.toContain("journal-still-caption");
    expect(css).toMatch(/\.journal-still\s*\{[^}]*border-radius:\s*0/);
    expect(css).toMatch(/\.journal-still\s*\{[^}]*box-shadow:\s*none/);
    expect(index).not.toContain("journal-still");
    expect(index).not.toContain("<img");
    expect(index).not.toContain("<Image");
    expect(index).not.toContain("thumbnail");
  });

  it("keeps banned words out of Journal content", () => {
    expect(journalSource).not.toMatch(BANNED);
    expect(journalSource).not.toMatch(/Quintessence/);
    expect(journalSource).not.toContain("楷");
    expect(journalSource).not.toMatch(/\bChina\b/);
    expect(journalSource).toContain("craftsmanship");
    expect(journalSource).not.toContain("materials sourced from around the world");
  });
});
