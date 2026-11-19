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
  AUTH_DESCRIPTION,
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
import { metadata as storyMetadata } from "@/app/(store)/story/page";
import { metadata as contactMetadata } from "@/app/(store)/contact/page";
import { metadata as faqsMetadata } from "@/app/(store)/faqs/page";
import { metadata as careMetadata } from "@/app/(store)/care/page";
import { metadata as shippingMetadata } from "@/app/(store)/shipping/page";
import { metadata as measureMetadata } from "@/app/(store)/measure/page";
import { metadata as repairMetadata } from "@/app/(store)/repair/page";
import { metadata as privacyMetadata } from "@/app/(store)/privacy/page";
import { metadata as termsMetadata } from "@/app/(store)/terms/page";
import { metadata as returnsMetadata } from "@/app/(store)/returns/page";
import { productPageMetadata } from "@/lib/product-page-metadata";
import { NOT_FOUND_DESCRIPTION, NOT_FOUND_TITLE } from "@/lib/page-social";
import { JOURNAL_INTRO, getJournalPost } from "@/data/journal";
import {
  getProductBySlug,
  PAYMENT_TEST_SLUG,
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

const NOINDEX_FOLLOW = {
  index: false,
  follow: true,
  googleBot: { index: false, follow: true },
};

const HOMEPAGE_TITLE =
  "Jewellery Quintessential · 極氣 | Natural Stone Jewellery with Cultural Craft";

describe("technical SEO preview", () => {
  it("disallows private routes and the payment-test listing", () => {
    const rules = robots().rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    const disallow = rule?.disallow;
    const paths = Array.isArray(disallow) ? disallow : [disallow];
    expect(PAYMENT_TEST_SLUG).toBe("payment-test-do-not-ship");
    expect(paths).toEqual(
      expect.arrayContaining([
        "/api",
        "/cart",
        "/checkout",
        "/auth",
        "/account",
        "/admin",
        `/products/${PAYMENT_TEST_SLUG}`,
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
    expect(entries.some((entry) => entry.url.includes(PAYMENT_TEST_SLUG))).toBe(
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
    const slugs = [PAYMENT_TEST_SLUG, "not-a-catalog-piece"];
    expect(getProductBySlug(`  ${PAYMENT_TEST_SLUG}  `)).toBeUndefined();

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

    expect(cartMetadata.description).toBe(
      "Discover bracelets and necklaces selected for everyday wear.",
    );
    expect(cartMetadata.description).not.toBe("Your cart is empty.");
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
    expect(
      readFileSync(path.join(root, "app/(store)/cart/page.tsx"), "utf8"),
    ).toContain("Discover bracelets and necklaces selected for everyday wear.");

    expect(checkoutMetadata.description).toBe("Secure payment.");
    expect(checkoutMetadata.openGraph).toMatchObject({
      title: "Checkout — Jewellery Quintessential",
      description: "Secure payment.",
      url: "/checkout",
    });
    expect(checkoutMetadata.twitter).toMatchObject({
      title: "Checkout — Jewellery Quintessential",
      description: "Secure payment.",
    });
    expect(checkoutMetadata.openGraph?.title).not.toBe(HOMEPAGE_TITLE);
    expect(checkoutMetadata.twitter?.title).not.toBe(HOMEPAGE_TITLE);
    expect(checkoutMetadata.description).not.toBe(HOMEPAGE_DESCRIPTION);
    const checkoutPage = readFileSync(
      path.join(root, "app/(store)/checkout/page.tsx"),
      "utf8",
    );
    expect(checkoutPage).toContain("Secure payment");
    expect(checkoutPage).not.toContain("Secure payment.");
  });

  it("gives auth and login their own social titles, and login its own canonical", () => {
    expect(authMetadata.title).toEqual({ absolute: AUTH_TITLE });
    expect(authMetadata.robots).toEqual(NOINDEX_FOLLOW);
    expect(authMetadata.description).toBe(AUTH_DESCRIPTION);
    expect(authMetadata.description).not.toBe(AUTH_TITLE);
    expect(AUTH_DESCRIPTION).toBe(
      "Create your account to save pieces and follow your orders.",
    );
    expect(authMetadata.openGraph).toMatchObject({
      title: AUTH_TITLE,
      description: AUTH_DESCRIPTION,
    });
    expect(authMetadata.twitter).toMatchObject({
      title: AUTH_TITLE,
      description: AUTH_DESCRIPTION,
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
    const loginForm = readFileSync(
      path.join(root, "app/(auth)/auth/login/login-form.tsx"),
      "utf8",
    );
    expect(loginForm).toContain(LOGIN_DESCRIPTION);
    expect(loginForm).toContain(AUTH_DESCRIPTION);
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

  it("gives remaining indexed content pages their own social title, description, and url", () => {
    const layout = readFileSync(path.join(root, "app/layout.tsx"), "utf8");
    expect(layout).toContain('template: "%s — Jewellery Quintessential"');

    const cases = [
      {
        metadata: storyMetadata,
        segment: "Our Story",
        path: "/story",
        description:
          "Discover how Jewellery Quintessential approaches natural stone jewellery, thoughtful gifting, and everyday ritual.",
      },
      {
        metadata: contactMetadata,
        segment: "Contact Us",
        path: "/contact",
        description:
          "Contact Jewellery Quintessential for help with natural stone jewellery orders, sizing, shipping, returns, repairs, and product questions.",
      },
      {
        metadata: faqsMetadata,
        segment: "Jewellery FAQs",
        path: "/faqs",
        description:
          "Answers about Jewellery Quintessential orders, payment, shipping, returns, resizing, natural stone jewellery care, and repairs.",
      },
      {
        metadata: careMetadata,
        segment: "Natural Stone Jewellery Care",
        path: "/care",
        description:
          "Learn how to clean, store, and care for natural stone jewellery from Jewellery Quintessential.",
      },
      {
        metadata: shippingMetadata,
        segment: "Shipping Policy",
        path: "/shipping",
        description:
          "Review JQD Group order processing, delivery timing, tracking, international duties, and shipping support.",
      },
      {
        metadata: measureMetadata,
        segment: "Bracelet Wrist Size Guide",
        path: "/measure",
        description:
          "Measure your wrist and choose a close, everyday, or relaxed bracelet fit before ordering natural stone jewellery from Jewellery Quintessential.",
      },
      {
        metadata: repairMetadata,
        segment: "Jewellery Repairs",
        path: "/repair",
        description:
          "Request support for a Jewellery Quintessential jewellery repair, including how to share photos, order details, and available service options.",
      },
      {
        metadata: privacyMetadata,
        segment: "Privacy Policy",
        path: "/privacy",
        description:
          "Read the JQD Group privacy policy for information about the data we collect, how we use it, and your privacy choices.",
      },
      {
        metadata: termsMetadata,
        segment: "Terms & Conditions",
        path: "/terms",
        description:
          "Review the JQD Group terms and conditions for using the website and purchasing natural stone jewellery.",
      },
      {
        metadata: returnsMetadata,
        segment: "Returns, Resizes & Exchanges",
        path: "/returns",
        description:
          "Understand JQD Group eligibility windows, return instructions, exchanges, resizing, and refund timing.",
      },
    ];

    for (const { metadata, segment, path: pagePath, description } of cases) {
      const title = `${segment} — Jewellery Quintessential`;
      expect(metadata.title).toBe(segment);
      expect(metadata.description).toBe(description);
      expect(metadata.alternates).toEqual({ canonical: pagePath });
      expect(metadata).not.toHaveProperty("robots");
      expect(metadata.openGraph).toMatchObject({
        title,
        description,
        url: pagePath,
      });
      expect(metadata.twitter).toMatchObject({ title, description });
      expect(metadata.openGraph?.title).not.toBe(HOMEPAGE_TITLE);
      expect(metadata.twitter?.title).not.toBe(HOMEPAGE_TITLE);
      expect(metadata.openGraph?.description).not.toBe(HOMEPAGE_DESCRIPTION);
      expect(metadata.twitter?.description).not.toBe(HOMEPAGE_DESCRIPTION);
      expect(metadata.openGraph?.url).not.toBe("/");
      expect(metadata.openGraph?.url).not.toBe("https://jqd.app");
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
