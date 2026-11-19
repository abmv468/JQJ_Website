import { expect, test, type APIResponse } from "@playwright/test";
import { JOURNAL_POSTS } from "../data/journal";
import {
  PAYMENT_TEST_SLUG,
  paymentTestListingHidden,
  products,
  unlistedProducts,
} from "../data/products";
import { NOT_FOUND_DESCRIPTION, NOT_FOUND_TITLE } from "../lib/page-social";

const MISSING_PRODUCT = "/products/this-slug-does-not-exist-jqd";
const MISSING_JOURNAL = "/journal/this-slug-does-not-exist-jqd";
const MISSING_ROOT = "/this-path-does-not-exist-jqd";

function escapeHtmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

function documentBody(html: string): string {
  const body = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  if (!body) throw new Error("response has no body element");
  return body[1].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

function visibleDocument(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

function assertBrandedNotFound(response: APIResponse, html: string) {
  expect(response.status()).toBe(404);
  expect(html).not.toContain("__next_error__");
  expect(html).toMatch(/<html\b[^>]*\slang="en"/);
  expect(html).toContain(`<title>${NOT_FOUND_TITLE}</title>`);

  const robots = [...html.matchAll(/<meta\b[^>]*name="robots"[^>]*>/gi)];
  expect(robots).toHaveLength(1);
  expect(robots[0][0]).toContain("noindex, nofollow");
  expect(html).not.toMatch(/<meta\b[^>]*name="googlebot"/i);
  expect(html).not.toMatch(/<link\b[^>]*rel="canonical"/i);

  const visible = visibleDocument(html);
  const targets = visible.match(/id="main-content"/g) ?? [];
  expect(targets).toHaveLength(1);
  expect(visible).toMatch(
    /<a\b(?=[^>]*class="skip-to-content")(?=[^>]*href="#main-content")[^>]*>\s*Skip to content\s*<\/a>/,
  );

  const body = documentBody(html);
  expect(body).toMatch(/<h1\b[^>]*>\s*Page not found\s*<\/h1>/);
  expect(body).toContain(NOT_FOUND_DESCRIPTION);
  expect(body).toMatch(/<a\b[^>]*href="\/"[^>]*>\s*Back to Home\s*<\/a>/);
  expect(body.match(/id="main-content"/g)).toHaveLength(1);
  expect(body).toContain("skip-to-content");
}

test("product and journal not-found documents match the root 404", async ({
  request,
}) => {
  expect(paymentTestListingHidden).toBe(true);
  const hidden = unlistedProducts.find(
    (product) => product.slug === PAYMENT_TEST_SLUG,
  );
  expect(hidden?.name).toBeTruthy();

  const root = await request.get(MISSING_ROOT, { failOnStatusCode: false });
  const rootHtml = await root.text();
  assertBrandedNotFound(root, rootHtml);
  const rootBody = documentBody(rootHtml);

  const paths = [
    `/products/${PAYMENT_TEST_SLUG}`,
    MISSING_PRODUCT,
    MISSING_JOURNAL,
    "/journal/caring-for-natural-stone",
  ];

  for (const path of paths) {
    const response = await request.get(path, { failOnStatusCode: false });
    const html = await response.text();
    assertBrandedNotFound(response, html);
    expect(documentBody(html)).toBe(rootBody);
    expect(html).not.toContain(hidden?.name ?? "Payment test");
    expect(html).not.toContain("JQJ-PAYTEST-001");
  }
});

test("published product and journal pages stay indexable", async ({
  request,
}) => {
  expect(products.length).toBeGreaterThan(0);
  expect(JOURNAL_POSTS.length).toBeGreaterThan(0);

  const cases = [
    ...products.map((product) => ({
      path: `/products/${product.slug}`,
      canonical: `/products/${product.slug}`,
      heading: product.name,
    })),
    ...JOURNAL_POSTS.map((post) => ({
      path: `/journal/${post.slug}`,
      canonical: `/journal/${post.slug}`,
      heading: post.title,
    })),
  ];

  for (const item of cases) {
    const response = await request.get(item.path);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).not.toContain("__next_error__");
    expect(html).not.toContain("noindex");
    expect(html).toContain('name="robots" content="index, follow"');
    const googlebot = html.match(/<meta name="googlebot" content="([^"]*)"\/>/);
    expect(googlebot?.[1]?.startsWith("index, follow")).toBe(true);
    if (item.path.startsWith("/products/")) {
      expect(googlebot?.[1]).toBe(
        "index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1",
      );
    }
    const canonical = [
      ...html.matchAll(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/g),
    ].map((match) => match[1]);
    expect(canonical).toHaveLength(1);
    expect(new URL(canonical[0]).pathname).toBe(item.canonical);
    const body = documentBody(html);
    expect(body.match(/id="main-content"/g)).toHaveLength(1);
    expect(body).toContain("skip-to-content");
    expect(body).toContain('href="#main-content"');
    expect(body).toContain(escapeHtmlText(item.heading));
    expect(body).not.toMatch(/<h1\b[^>]*>\s*Page not found\s*<\/h1>/);
  }
});
