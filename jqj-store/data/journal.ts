export const JOURNAL_CATEGORIES = [
  { slug: "all", label: "All" },
  { slug: "care", label: "Care" },
  { slug: "stones", label: "Stones" },
  { slug: "gifting", label: "Gifting" },
  { slug: "dressing", label: "Dressing" },
  { slug: "meaning", label: "Meaning" },
  { slug: "history", label: "History" },
] as const;

export type JournalCategory = Exclude<(typeof JOURNAL_CATEGORIES)[number]["slug"], "all">;

export type JournalCatalogueCategory = JournalCategory | "all" | "unknown";

export type JournalBlock =
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string };

export type JournalPost = {
  slug: string;
  title: string;
  displayDate: string;
  dateTime: string;
  category: JournalCategory;
  dek: string;
  body?: readonly JournalBlock[];
};

export const JOURNAL_INTRO = {
  eyebrow: "Journal",
  title: "Journal",
  dek: "Notes on natural stone, care, and dressing pieces designed in Hong Kong.",
  fictional: "Example posts below are fictional, for layout only.",
} as const;

export const JOURNAL_ARTICLE_FICTIONAL = "Example post — fictional";

export const JOURNAL_POSTS: readonly JournalPost[] = [
  {
    slug: "caring-for-natural-stone",
    title: "Caring for natural stone",
    displayDate: "12 November 2026",
    dateTime: "2026-11-12",
    category: "care",
    dek: "A short note on keeping gemstone pieces quiet and clean — a soft cloth, no soak, and a little time.",
    body: [
      {
        type: "paragraph",
        text: "A soft cloth is enough for most days. After wearing, wipe the stone and the metal, then let the piece sit in the open air before you put it away.",
      },
      {
        type: "paragraph",
        text: "Avoid long soaks, ultrasonic cleaners, and household chemicals. Natural stone can be porous, and a quiet routine will keep it looking as it should.",
      },
      {
        type: "quote",
        text: "Wipe, rest, and put it away. That is the whole of the daily care.",
      },
      {
        type: "paragraph",
        text: "If a clasp or thread needs attention, write to us from the Contact page. We would rather look at a piece early than leave it to wear unevenly.",
      },
      {
        type: "paragraph",
        text: "These notes are for layout only. They are not a published Journal post, and they do not replace the care page already on the site.",
      },
    ],
  },
  {
    slug: "designed-in-hong-kong",
    title: "Designed in Hong Kong",
    displayDate: "5 November 2026",
    dateTime: "2026-11-05",
    category: "history",
    dek: "A house note on designing in Hong Kong, and on materials sourced from around the world.",
  },
  {
    slug: "materials-sourced-from-around-the-world",
    title: "Materials sourced from around the world",
    displayDate: "29 October 2026",
    dateTime: "2026-10-29",
    category: "stones",
    dek: "A plain look at natural stone and metal, and how we speak about where they come from.",
  },
  {
    slug: "dressing-stone-for-everyday-ritual",
    title: "Dressing stone for everyday ritual",
    displayDate: "22 October 2026",
    dateTime: "2026-10-22",
    category: "dressing",
    dek: "How to wear a bracelet or a necklace with the rest of the day, without waiting for a special occasion.",
  },
];

const CATEGORY_SLUGS = new Set<string>(JOURNAL_CATEGORIES.map((item) => item.slug));

export function parseJournalCategory(value: string | undefined): JournalCatalogueCategory {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw || raw === "all") return "all";
  if (CATEGORY_SLUGS.has(raw)) return raw as JournalCategory;
  return "unknown";
}

export function journalCategoryLabel(category: JournalCatalogueCategory): string | null {
  return JOURNAL_CATEGORIES.find((item) => item.slug === category)?.label ?? null;
}

export function journalFilterStatus(category: JournalCatalogueCategory): string | null {
  const label = journalCategoryLabel(category);
  if (!label || category === "all") return null;
  return `Showing notes in ${label}.`;
}

export function journalEmptyMessage(category: JournalCatalogueCategory, query: string): string {
  if (query.trim()) return "No notes match this search.";
  const label = journalCategoryLabel(category);
  if (label && category !== "all") return `No notes in ${label}.`;
  return "No notes match this search.";
}

export function filterJournalPosts(
  posts: readonly JournalPost[],
  { category, query }: { category: JournalCatalogueCategory; query: string }
): JournalPost[] {
  const needle = query.trim().toLowerCase();
  return posts.filter((post) => {
    if (category === "unknown") return false;
    if (category !== "all" && post.category !== category) return false;
    if (!needle) return true;
    return `${post.title}\n${post.dek}`.toLowerCase().includes(needle);
  });
}

export function getJournalPost(slug: string): JournalPost | undefined {
  return JOURNAL_POSTS.find((post) => post.slug === slug);
}

export function journalCategoryHref(slug: (typeof JOURNAL_CATEGORIES)[number]["slug"]): string {
  return slug === "all" ? "/journal" : `/journal?category=${slug}`;
}
