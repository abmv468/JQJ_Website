import { describe, expect, it } from "vitest";
import ProductPage, {
  dynamicParams as productDynamicParams,
  generateStaticParams as productStaticParamsFromPage,
} from "@/app/(store)/products/[slug]/page";
import {
  dynamicParams as journalDynamicParams,
  generateStaticParams as journalStaticParams,
} from "@/app/(store)/journal/[slug]/page";
import { JOURNAL_POSTS } from "@/data/journal";
import {
  PAYMENT_TEST_SLUG,
  paymentTestListingHidden,
  productStaticParams,
  products,
} from "@/data/products";

const RETIRED_JOURNAL_SLUGS = [
  "caring-for-natural-stone",
  "a-short-history-of-jewellery-as-everyday-ritual",
  "materials-sourced-from-around-the-world",
  "dressing-stone-for-everyday-ritual",
  "designed-in-hong-kong",
];

describe("dynamic segment 404 routing", () => {
  it("keeps unknown product and journal slugs out of static params", () => {
    expect(paymentTestListingHidden).toBe(true);
    expect(productDynamicParams).toBe(false);
    expect(journalDynamicParams).toBe(false);

    const productSlugs = productStaticParamsFromPage().map(
      (param) => param.slug,
    );
    expect(productSlugs).toEqual(products.map((product) => product.slug));
    expect(productSlugs).not.toContain(PAYMENT_TEST_SLUG);
    expect(productSlugs).not.toContain("this-slug-does-not-exist-jqd");
    expect(productStaticParams(true).map((param) => param.slug)).toEqual(
      productSlugs,
    );
    expect(productStaticParams(false).map((param) => param.slug)).toEqual([
      ...productSlugs,
      PAYMENT_TEST_SLUG,
    ]);

    const journalSlugs = journalStaticParams().map((param) => param.slug);
    expect(journalSlugs).toEqual(JOURNAL_POSTS.map((post) => post.slug));
    expect(journalSlugs).not.toContain("this-slug-does-not-exist-jqd");
    for (const slug of RETIRED_JOURNAL_SLUGS) {
      expect(journalSlugs).not.toContain(slug);
    }
  });

  it("still refuses the hidden payment-test listing from the product page", () => {
    expect(() => ProductPage({ params: { slug: PAYMENT_TEST_SLUG } })).toThrow(
      expect.objectContaining({ digest: "NEXT_NOT_FOUND" }),
    );
    expect(() =>
      ProductPage({ params: { slug: "this-slug-does-not-exist-jqd" } }),
    ).toThrow(expect.objectContaining({ digest: "NEXT_NOT_FOUND" }));
  });
});
