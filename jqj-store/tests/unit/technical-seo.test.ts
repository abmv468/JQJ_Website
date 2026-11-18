import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { metadata as notFoundMetadata } from "@/app/not-found";
import { metadata as journalMetadata } from "@/app/(store)/journal/page";
import { generateMetadata as journalArticleMetadata } from "@/app/(store)/journal/[slug]/page";
import { metadata as cartMetadata } from "@/app/(store)/cart/layout";
import { metadata as checkoutMetadata } from "@/app/(store)/checkout/layout";
import {
  AUTH_TITLE,
  LOGIN_DESCRIPTION,
  LOGIN_TITLE,
  authMetadata,
  loginMetadata,
} from "@/lib/auth/page-metadata";
import { LOYALTY_TITLE, loyaltyMetadata } from "@/lib/loyalty-metadata";
import { generateMetadata as newMetadata } from "@/app/(store)/new/page";
import { generateMetadata as braceletsMetadata } from "@/app/(store)/bracelets/page";
import { generateMetadata as necklacesMetadata } from "@/app/(store)/necklaces/page";
import { productPageMetadata } from "@/lib/product-page-metadata";
import { NOT_FOUND_DESCRIPTION, NOT_FOUND_TITLE } from "@/lib/page-social";
import { JOURNAL_INTRO, getJournalPost } from "@/data/journal";
import {
  getProductBySlug,
  paymentTestListingHidden,
  products,
} from "@/data/products";
import {
  NOT_FOUND_ROBOTS,
  NOT_FOUND_ROBOTS_COMPILED_FILES,
  NOT_FOUND_ROBOTS_FILES,
} from "../../scripts/patch-not-found-robots.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const HOMEPAGE_DESCRIPTION =
  "Bracelets and necklaces inspired by Eastern cultural heritage, museum collaborations, and natural gemstone artistry.";

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

  it("gives a 404 one noindex, nofollow robots tag and no canonical", () => {
    expect(notFoundMetadata.robots).toBeNull();
    expect(notFoundMetadata.alternates).toEqual({ canonical: null });
    expect(notFoundMetadata.description).toBe(NOT_FOUND_DESCRIPTION);
    expect(notFoundMetadata.openGraph).toMatchObject({
      title: NOT_FOUND_TITLE,
      description: NOT_FOUND_DESCRIPTION,
    });
    expect(notFoundMetadata.openGraph).not.toHaveProperty("url");
    expect(notFoundMetadata.twitter).toMatchObject({
      title: NOT_FOUND_TITLE,
      description: NOT_FOUND_DESCRIPTION,
    });
    expect(notFoundMetadata.openGraph?.title).not.toBe(HOMEPAGE_TITLE);
    expect(notFoundMetadata.twitter?.title).not.toBe(HOMEPAGE_TITLE);
    expect(notFoundMetadata.description).not.toBe(HOMEPAGE_DESCRIPTION);

    for (const relative of NOT_FOUND_ROBOTS_FILES) {
      const source = readFileSync(
        path.join(root, "node_modules/next", relative),
        "utf8",
      );
      expect(source).toContain(`content: "${NOT_FOUND_ROBOTS}"`);
      expect(source).not.toMatch(
        /name:\s*"robots",\s*content:\s*"noindex"(?!,)/,
      );
    }
    for (const relative of NOT_FOUND_ROBOTS_COMPILED_FILES) {
      const source = readFileSync(
        path.join(root, "node_modules/next", relative),
        "utf8",
      );
      expect(source).toContain(`content:"${NOT_FOUND_ROBOTS}"`);
      expect(source).not.toContain('{name:"robots",content:"noindex"}');
    }
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
      expect(metadata.robots).toBeNull();
      expect(metadata.alternates).toEqual({ canonical: null });
      expect(metadata.openGraph).toMatchObject({
        title: NOT_FOUND_TITLE,
        description: NOT_FOUND_DESCRIPTION,
      });
      expect(metadata.openGraph).not.toHaveProperty("url");
      expect(metadata.twitter).toMatchObject({
        title: NOT_FOUND_TITLE,
        description: NOT_FOUND_DESCRIPTION,
      });
      expect(metadata.openGraph?.title).not.toBe(HOMEPAGE_TITLE);
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

    expect(cartMetadata.openGraph).toMatchObject({
      title: "Cart — Jewellery Quintessential",
      description:
        "Discover bracelets and necklaces selected for everyday wear.",
      url: "/cart",
    });
    expect(cartMetadata.twitter).toMatchObject({
      title: "Cart — Jewellery Quintessential",
      description:
        "Discover bracelets and necklaces selected for everyday wear.",
    });
    expect(cartMetadata.openGraph?.title).not.toBe(HOMEPAGE_TITLE);
    expect(cartMetadata.twitter?.title).not.toBe(HOMEPAGE_TITLE);
    expect(cartMetadata.description).not.toBe(HOMEPAGE_DESCRIPTION);

    expect(checkoutMetadata.openGraph).toMatchObject({
      title: "Checkout — Jewellery Quintessential",
      description: "Secure payment",
      url: "/checkout",
    });
    expect(checkoutMetadata.twitter).toMatchObject({
      title: "Checkout — Jewellery Quintessential",
      description: "Secure payment",
    });
    expect(checkoutMetadata.openGraph?.title).not.toBe(HOMEPAGE_TITLE);
    expect(checkoutMetadata.twitter?.title).not.toBe(HOMEPAGE_TITLE);
    expect(checkoutMetadata.description).not.toBe(HOMEPAGE_DESCRIPTION);
  });

  it("gives auth and login their own social titles, and login its own canonical", () => {
    expect(authMetadata.title).toEqual({ absolute: AUTH_TITLE });
    expect(authMetadata.openGraph).toMatchObject({
      title: AUTH_TITLE,
      description: AUTH_TITLE,
    });
    expect(authMetadata.twitter?.title).toBe(AUTH_TITLE);
    expect(authMetadata.openGraph?.title).not.toBe(HOMEPAGE_TITLE);
    expect(authMetadata.description).not.toBe(HOMEPAGE_DESCRIPTION);

    expect(loginMetadata.title).toEqual({ absolute: LOGIN_TITLE });
    expect(loginMetadata.alternates).toEqual({ canonical: "/auth/login" });
    expect(loginMetadata.alternates?.canonical).not.toBe("/");
    expect(loginMetadata.openGraph).toMatchObject({
      title: LOGIN_TITLE,
      description: LOGIN_DESCRIPTION,
      url: "/auth/login",
    });
    expect(loginMetadata.twitter).toMatchObject({
      title: LOGIN_TITLE,
      description: LOGIN_DESCRIPTION,
    });
    expect(loginMetadata.openGraph?.title).not.toBe(HOMEPAGE_TITLE);
    expect(loginMetadata.twitter?.title).not.toBe(HOMEPAGE_TITLE);
    expect(
      readFileSync(path.join(root, "app/(auth)/auth/layout.tsx"), "utf8"),
    ).toContain("export const metadata = authMetadata");
    expect(
      readFileSync(path.join(root, "app/(auth)/auth/login/page.tsx"), "utf8"),
    ).toContain("export const metadata = loginMetadata");
    expect(
      readFileSync(
        path.join(root, "app/(auth)/auth/login/login-form.tsx"),
        "utf8",
      ),
    ).toContain(LOGIN_DESCRIPTION);
  });

  it("redirects bare /auth to /auth/login", async () => {
    const nextConfig = require(path.join(root, "next.config.js")) as {
      redirects: () => Promise<
        { source: string; destination: string; permanent: boolean }[]
      >;
    };
    await expect(nextConfig.redirects()).resolves.toEqual([
      {
        source: "/auth",
        destination: "/auth/login",
        permanent: true,
      },
    ]);
  });

  it("gives loyalty its own title, canonical, and one sitemap entry", () => {
    expect(loyaltyMetadata.title).toEqual({ absolute: LOYALTY_TITLE });
    expect(LOYALTY_TITLE).toBe("Collector Updates — Jewellery Quintessential");
    expect(loyaltyMetadata.alternates).toEqual({ canonical: "/loyalty" });
    expect(loyaltyMetadata.description).toBe(
      "Join our list for new pieces and updates.",
    );
    expect(loyaltyMetadata.openGraph).toMatchObject({
      title: LOYALTY_TITLE,
      description: "Join our list for new pieces and updates.",
      url: "/loyalty",
    });
    expect(loyaltyMetadata.twitter?.title).toBe(LOYALTY_TITLE);
    expect(loyaltyMetadata.openGraph?.title).not.toBe(HOMEPAGE_TITLE);
    expect(loyaltyMetadata.twitter?.title).not.toBe(HOMEPAGE_TITLE);

    const entries = sitemap().filter((entry) => entry.url.endsWith("/loyalty"));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.lastModified).toEqual(
      new Date("2026-11-18T01:07:00.000Z"),
    );
  });

  it("gives collection pages their own twitter titles", () => {
    const cases = [
      {
        metadata: newMetadata({ searchParams: {} }),
        title: "New Natural Stone Jewellery — Jewellery Quintessential",
        description:
          "Shop new natural stone jewellery, recent releases from Jewellery Quintessential.",
      },
      {
        metadata: braceletsMetadata({ searchParams: {} }),
        title: "Natural Stone Bracelets — Jewellery Quintessential",
        description:
          "Explore natural stone bracelets designed for everyday wear, thoughtful gifting, and a personal fit.",
      },
      {
        metadata: necklacesMetadata({ searchParams: {} }),
        title: "Gemstone Necklaces — Jewellery Quintessential",
        description:
          "Discover gemstone necklaces and pendants with natural character, refined metalwork, and a considered everyday profile.",
      },
    ];

    for (const { metadata, title, description } of cases) {
      expect(metadata.description).toBe(description);
      expect(metadata.description).not.toContain("limited pieces");
      expect(metadata.openGraph).toMatchObject({ title, description });
      expect(metadata.twitter).toMatchObject({ title, description });
      expect(metadata.twitter?.title).not.toBe(HOMEPAGE_TITLE);
    }
  });

  it("adds a skip-to-content link that targets each shell", () => {
    const layout = readFileSync(path.join(root, "app/layout.tsx"), "utf8");
    expect(layout).toContain('href="#main-content"');
    expect(layout).toContain("Skip to content");
    expect(layout).toContain("skip-to-content");

    for (const relative of [
      "components/layout/StoreShell.tsx",
      "components/auth/AuthShell.tsx",
      "app/admin/layout.tsx",
      "app/not-found.tsx",
    ]) {
      expect(readFileSync(path.join(root, relative), "utf8")).toContain(
        'id="main-content"',
      );
    }
  });
});
