import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { metadata as notFoundMetadata } from "@/app/not-found";
import { metadata as journalMetadata } from "@/app/(store)/journal/page";
import { generateMetadata as journalArticleMetadata } from "@/app/(store)/journal/[slug]/page";
import { metadata as cartMetadata } from "@/app/(store)/cart/layout";
import { metadata as checkoutMetadata } from "@/app/(store)/checkout/layout";
import { productPageMetadata } from "@/lib/product-page-metadata";
import { JOURNAL_INTRO, getJournalPost } from "@/data/journal";
import {
  getProductBySlug,
  paymentTestListingHidden,
  products,
} from "@/data/products";

const PUBLISHED_JOURNAL_SLUGS = [
  "how-to-clean-a-crystal",
  "moonstones-blue-sheen-and-labradorite",
  "jewellery-for-a-long-day-at-your-desk",
  "victorian-fascination-with-crystal-jewellery",
] as const;

const RETIRED_JOURNAL_SLUGS = [
  "caring-for-natural-stone",
  "a-short-history-of-jewellery-as-everyday-ritual",
  "materials-sourced-from-around-the-world",
  "dressing-stone-for-everyday-ritual",
  "designed-in-hong-kong",
] as const;

const INDEX_FOLLOW = {
  index: true,
  follow: true,
  googleBot: { index: true, follow: true },
};

const NOINDEX = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false },
};

const NOINDEX_FOLLOW = { index: false, follow: true };

const HOMEPAGE_TITLE =
  "Jewellery Quintessential · 極氣 | Natural Stone Jewellery with Cultural Craft";

describe("technical SEO preview", () => {
  it("disallows private routes and the payment-test listing", () => {
    const rules = robots().rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    const disallow = rule?.disallow;
    const paths = Array.isArray(disallow) ? disallow : [disallow];
    expect(paths).toEqual(
      expect.arrayContaining([
        "/api",
        "/cart",
        "/checkout",
        "/auth",
        "/account",
        "/admin",
        "/products/payment-test-do-not-ship",
      ]),
    );
    expect(paymentTestListingHidden).toBe(true);
  });

  it("uses a real per-URL lastmod and keeps the payment-test listing out of the sitemap", () => {
    const entries = sitemap();
    const stamps = entries.map((entry) =>
      new Date(entry.lastModified ?? 0).toISOString(),
    );
    expect(new Set(stamps).size).toBeGreaterThan(1);
    expect(entries.every((entry) => entry.lastModified instanceof Date)).toBe(
      true,
    );
    expect(entries.some((entry) => entry.url.includes("payment-test"))).toBe(
      false,
    );
    const shipping = entries.find((entry) => entry.url.endsWith("/shipping"));
    const privacy = entries.find((entry) => entry.url.endsWith("/privacy"));
    const home = entries.find(
      (entry) => entry.url.endsWith("/") || entry.url.endsWith(".app/"),
    );
    expect(shipping?.lastModified).not.toEqual(privacy?.lastModified);
    expect(home?.lastModified).not.toEqual(privacy?.lastModified);
  });

  it("indexes the journal index and the four published notes", () => {
    expect(journalMetadata.robots).toMatchObject(INDEX_FOLLOW);

    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls.some((url) => url.endsWith("/journal"))).toBe(true);
    for (const slug of PUBLISHED_JOURNAL_SLUGS) {
      expect(journalArticleMetadata({ params: { slug } }).robots).toMatchObject(
        INDEX_FOLLOW,
      );
      expect(urls.some((url) => url.endsWith(`/journal/${slug}`))).toBe(true);
      const entry = entries.find((item) =>
        item.url.endsWith(`/journal/${slug}`),
      );
      expect(entry?.lastModified).toBeInstanceOf(Date);
    }
    const indexEntry = entries.find((entry) => entry.url.endsWith("/journal"));
    expect(indexEntry?.lastModified).toBeInstanceOf(Date);
    expect(indexEntry?.lastModified).toEqual(
      entries.find((entry) =>
        entry.url.endsWith("/journal/how-to-clean-a-crystal"),
      )?.lastModified,
    );

    for (const slug of RETIRED_JOURNAL_SLUGS) {
      expect(urls.some((url) => url.includes(slug))).toBe(false);
      expect(journalArticleMetadata({ params: { slug } }).robots).toMatchObject(
        NOINDEX,
      );
    }
  });

  it("does not tell googlebot to index a 404 or canonicalize it to the homepage", () => {
    expect(notFoundMetadata.robots).toMatchObject({
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    });
    expect(notFoundMetadata.alternates).toEqual({ canonical: null });
  });

  it("keeps unresolved product metadata noindex, nofollow, with no product canonical", () => {
    expect(paymentTestListingHidden).toBe(true);
    const slugs = ["payment-test-do-not-ship", "not-a-catalog-piece"];

    for (const slug of slugs) {
      expect(getProductBySlug(slug)).toBeUndefined();
      const metadata = productPageMetadata(slug);
      expect(metadata.title).not.toBe("Product");
      expect(metadata.title).toEqual({
        absolute: "Page not found — Jewellery Quintessential",
      });
      expect(metadata.robots).toEqual(NOINDEX);
      expect(metadata.alternates).toEqual({ canonical: null });
      expect(metadata.openGraph).toBeUndefined();
      expect(metadata.twitter).toBeUndefined();
      expect(JSON.stringify(metadata)).not.toContain(`/products/${slug}`);
    }

    const listed = products[0];
    const listedMetadata = productPageMetadata(listed.slug);
    expect(listedMetadata.title).toBe(listed.name);
    expect(listedMetadata.alternates).toEqual({
      canonical: `/products/${listed.slug}`,
    });
    expect(listedMetadata).not.toHaveProperty("robots");
  });

  it("gives the journal index and published notes their own social titles", () => {
    expect(journalMetadata.robots).toMatchObject(INDEX_FOLLOW);
    expect(journalMetadata.title).toEqual({
      absolute: "Journal — Jewellery Quintessential",
    });
    expect(journalMetadata.description).toBe(JOURNAL_INTRO.dek);
    expect(journalMetadata.alternates).toEqual({ canonical: "/journal" });
    expect(journalMetadata.openGraph).toMatchObject({
      title: "Journal — Jewellery Quintessential",
      description: JOURNAL_INTRO.dek,
      url: "/journal",
    });
    expect(journalMetadata.twitter).toMatchObject({
      title: "Journal — Jewellery Quintessential",
      description: JOURNAL_INTRO.dek,
    });
    expect(journalMetadata.openGraph?.title).not.toBe(HOMEPAGE_TITLE);
    expect(journalMetadata.twitter?.title).not.toBe(HOMEPAGE_TITLE);

    for (const slug of PUBLISHED_JOURNAL_SLUGS) {
      const post = getJournalPost(slug);
      const metadata = journalArticleMetadata({ params: { slug } });
      expect(post?.metaTitle).toBeTruthy();
      expect(post?.metaDescription).toBeTruthy();
      expect(metadata.robots).toMatchObject(INDEX_FOLLOW);
      expect(metadata.alternates).toEqual({ canonical: `/journal/${slug}` });
      expect(metadata.openGraph).toMatchObject({
        title: post?.metaTitle,
        description: post?.metaDescription,
        url: `/journal/${slug}`,
      });
      expect(metadata.twitter).toMatchObject({
        title: post?.metaTitle,
        description: post?.metaDescription,
      });
      expect(post?.metaTitle).not.toBe(HOMEPAGE_TITLE);
    }

    for (const slug of RETIRED_JOURNAL_SLUGS) {
      const metadata = journalArticleMetadata({ params: { slug } });
      expect(metadata.robots).toMatchObject(NOINDEX);
      expect(metadata.alternates).toEqual({ canonical: null });
    }
  });

  it("gives cart and checkout their own titles and non-homepage canonicals", () => {
    expect(cartMetadata.title).toEqual({
      absolute: "Cart — Jewellery Quintessential",
    });
    expect(cartMetadata.alternates).toEqual({ canonical: "/cart" });
    expect(cartMetadata.robots).toEqual(NOINDEX_FOLLOW);
    expect(cartMetadata.alternates?.canonical).not.toBe("/");

    expect(checkoutMetadata.title).toEqual({
      absolute: "Checkout — Jewellery Quintessential",
    });
    expect(checkoutMetadata.alternates).toEqual({ canonical: "/checkout" });
    expect(checkoutMetadata.robots).toEqual(NOINDEX_FOLLOW);
    expect(checkoutMetadata.alternates?.canonical).not.toBe("/");
  });
});
