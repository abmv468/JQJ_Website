import { expect, test, type Page } from "@playwright/test";
import {
  BRAND_HOME_DESCRIPTION,
  BRAND_NAME,
  BRAND_NAME_FULL,
  BRAND_NAME_ZH,
  BRAND_OG_IMAGE_ALT,
  BRAND_SOCIAL_TITLE,
  BRAND_TITLE_DEFAULT,
  LEGAL_ENTITY,
  SUPPORT_EMAIL,
} from "@/lib/brand";

const PRODUCT_PATH = "/products/pearl-silver-necklace-v";

type PageCase = {
  path: string;
  title: string;
  markInTitle: boolean;
  legalBody: boolean;
};

const pages: PageCase[] = [
  { path: "/", title: BRAND_TITLE_DEFAULT, markInTitle: true, legalBody: false },
  {
    path: PRODUCT_PATH,
    title: `Pearl - Silver Necklace V (7mm) | ${BRAND_NAME}`,
    markInTitle: false,
    legalBody: false,
  },
  {
    path: "/necklaces",
    title: `Gemstone Necklaces | ${BRAND_NAME}`,
    markInTitle: false,
    legalBody: false,
  },
  {
    path: "/returns",
    title: `Returns, Resizes & Exchanges | ${BRAND_NAME}`,
    markInTitle: false,
    legalBody: false,
  },
  {
    path: "/loyalty",
    title: `Updates | ${BRAND_NAME}`,
    markInTitle: false,
    legalBody: false,
  },
  {
    path: "/terms",
    title: `Terms & Conditions | ${BRAND_NAME}`,
    markInTitle: false,
    legalBody: true,
  },
  {
    path: "/privacy",
    title: `Privacy Policy | ${BRAND_NAME}`,
    markInTitle: false,
    legalBody: true,
  },
];

function jsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  for (const match of html.matchAll(pattern)) {
    blocks.push(JSON.parse(match[1].replace(/\\u003c/g, "<")));
  }
  return blocks;
}

function walk(value: unknown, visit: (key: string, text: string) => void, key = "") {
  if (typeof value === "string") {
    visit(key, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, `${key}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) {
      walk(child, visit, key ? `${key}.${childKey}` : childKey);
    }
  }
}

async function renderedHtml(page: Page) {
  return page.content();
}

test.describe("storefront brand", () => {
  for (const pageCase of pages) {
    test(`${pageCase.path} uses the brand once and keeps the mark in its allowed places`, async ({
      page,
    }) => {
      await page.goto(pageCase.path);
      const title = await page.title();
      const html = await renderedHtml(page);

      expect(title).toBe(pageCase.title);
      expect(title.split(BRAND_NAME).length - 1).toBe(1);
      expect(title.includes(BRAND_NAME_ZH)).toBe(pageCase.markInTitle);
      expect(html).not.toContain("Quintessence");

      const withoutTitle = html.replace(/<title>[\s\S]*?<\/title>/gi, "");
      const withoutScripts = withoutTitle.replace(/<script[\s\S]*?<\/script>/gi, "");
      expect(withoutScripts).not.toContain(BRAND_NAME_ZH);

      for (const block of jsonLdBlocks(html)) {
        walk(block, (key, text) => {
          if (text.includes(BRAND_NAME_ZH)) {
            expect(key.includes("alternateName")).toBe(true);
          }
        });
      }

      const withoutCopyright = withoutScripts.replace(
        new RegExp(
          `©(?:\\s|<!-- -->)*\\d{4}(?:\\s|<!-- -->)*—(?:\\s|<!-- -->)*${LEGAL_ENTITY}`,
          "g"
        ),
        ""
      );
      if (pageCase.legalBody) {
        expect(withoutCopyright).toContain(LEGAL_ENTITY);
      } else {
        expect(withoutCopyright).not.toContain(LEGAL_ENTITY);
      }

      await expect(page.getByText(new RegExp(`© \\d{4} — ${LEGAL_ENTITY}`))).toBeVisible();
    });
  }

  test("home social metadata and JSON-LD use the locked names", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      BRAND_SOCIAL_TITLE
    );
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
      "content",
      BRAND_NAME
    );
    await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute(
      "content",
      BRAND_SOCIAL_TITLE
    );
    await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
      "content",
      BRAND_OG_IMAGE_ALT
    );
    expect(BRAND_SOCIAL_TITLE).not.toContain(BRAND_NAME_ZH);

    const blocks = jsonLdBlocks(await page.content());
    const organization = blocks.find(
      (block) =>
        typeof block === "object" &&
        block !== null &&
        (block as { "@type"?: string })["@type"] === "Organization"
    ) as { name: string; alternateName: string[]; legalName?: string };
    const website = blocks.find(
      (block) =>
        typeof block === "object" &&
        block !== null &&
        (block as { "@type"?: string })["@type"] === "WebSite"
    ) as { name: string; alternateName: string };

    expect(organization.name).toBe(BRAND_NAME);
    expect(organization.alternateName).toEqual([BRAND_NAME_ZH, BRAND_NAME_FULL]);
    expect(organization.legalName).toBeUndefined();
    expect(website.name).toBe(BRAND_NAME);
    expect(website.alternateName).toBe(BRAND_NAME_ZH);

    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      BRAND_HOME_DESCRIPTION
    );
    await expect(page.getByText("Museum-inspired craftsmanship since 2015")).toBeVisible();
    await expect(page.locator("img[alt='Model wearing a red bead bracelet by Jewellery Quintessential']")).toHaveCount(1);
    await expect(
      page.locator(`img[alt="${BRAND_NAME} artisan fitting a bracelet"]`)
    ).toHaveCount(1);
    await expect(page.getByRole("link", { name: `${BRAND_NAME} home` })).toBeVisible();
  });

  test("a product page names the brand in JSON-LD and not the legal entity", async ({ page }) => {
    await page.goto(PRODUCT_PATH);
    const product = jsonLdBlocks(await page.content()).find(
      (block) =>
        typeof block === "object" &&
        block !== null &&
        (block as { "@type"?: string })["@type"] === "Product"
    ) as { brand: { "@type": string; name: string }; description: string };

    expect(product.brand).toEqual({ "@type": "Brand", name: BRAND_NAME });
    expect(product.description).not.toContain(LEGAL_ENTITY);
    await expect(
      page.getByText("Crafted in our atelier with museum-inspired design values")
    ).toBeVisible();

    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "Pearl - Silver Necklace V (7mm)"
    );
  });

  test("necklaces, returns, and loyalty keep one brand in the title and social tags", async ({
    page,
  }) => {
    await page.goto("/necklaces");
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      `Gemstone Necklaces | ${BRAND_NAME}`
    );

    await page.goto("/returns");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      `Understand ${BRAND_NAME} eligibility windows, return instructions, exchanges, resizing, and refund timing.`
    );
    await expect(page.getByText(`alterations not performed by ${BRAND_NAME}`)).toBeVisible();
    await expect(page.getByText("Return requests must be submitted within 14 days of delivery.")).toBeVisible();
    const returnsMail = page.getByRole("link", { name: SUPPORT_EMAIL });
    await expect(returnsMail).toHaveAttribute("href", `mailto:${SUPPORT_EMAIL}`);
    await expect(page.getByText("returns@jqdgroup.com")).toHaveCount(0);

    await page.goto("/bracelets");
    await expect(
      page.getByText(
        "Museum-inspired bracelet designs, hand-finished in our atelier with carefully selected natural stones."
      )
    ).toBeVisible();
    await expect(page.getByText(`${BRAND_NAME} bracelets are selected`)).toBeVisible();
  });

  test("loyalty canonical, heading, and support address", async ({ page }) => {
    await page.goto("/loyalty");
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(new URL(canonical ?? "").pathname).toBe("/loyalty");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      `Updates from ${BRAND_NAME}`
    );
    await expect(
      page.getByText(`Join the ${BRAND_NAME} mailing list for new gemstone edits, limited drops, and collector releases.`)
    ).toBeVisible();
    await expect(page.getByRole("link", { name: SUPPORT_EMAIL })).toHaveAttribute(
      "href",
      `mailto:${SUPPORT_EMAIL}`
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      BRAND_SOCIAL_TITLE
    );
    expect(await page.locator('meta[property="og:title"]').getAttribute("content")).not.toContain(
      BRAND_NAME_ZH
    );
  });

  test("terms and privacy keep the legal entity and the existing addresses", async ({ page }) => {
    await page.goto("/terms");
    await expect(
      page.getByText(
        `By using our website or purchasing from ${LEGAL_ENTITY}, you agree to these terms. Please review them before placing an order.`
      )
    ).toBeVisible();
    await expect(page.getByRole("link", { name: SUPPORT_EMAIL })).toHaveAttribute(
      "href",
      `mailto:${SUPPORT_EMAIL}`
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      `Review the ${LEGAL_ENTITY} terms and conditions for using the website and purchasing natural stone jewelry.`
    );

    await page.goto("/privacy");
    await expect(
      page.getByText(
        `We do not sell personal information. Service providers may access data only as required to perform their services for ${LEGAL_ENTITY}.`
      )
    ).toBeVisible();
    const privacyLinks = page.getByRole("link", { name: SUPPORT_EMAIL });
    await expect(privacyLinks).toHaveCount(2);
    await expect(privacyLinks.nth(0)).toHaveAttribute("href", `mailto:${SUPPORT_EMAIL}`);
    await expect(privacyLinks.nth(1)).toHaveAttribute("href", `mailto:${SUPPORT_EMAIL}`);
    await expect(page.getByText("privacy@jqdgroup.com")).toHaveCount(0);
  });

  test("an invalid confirmation tells the shopper which address to use", async ({ page }) => {
    await page.goto("/order-confirmation");
    await expect(page.getByRole("heading", { name: /confirm your order/i })).toBeVisible();
    await expect(page.getByRole("link", { name: SUPPORT_EMAIL })).toHaveAttribute(
      "href",
      `mailto:${SUPPORT_EMAIL}`
    );
  });

  test("the favicon is a small icon and not the full logo file", async ({ page }) => {
    await page.goto("/");
    const hrefs = await page
      .locator('link[rel="icon"], link[rel="shortcut icon"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));

    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).not.toContain("JQD-logo");
      const response = await page.request.get(new URL(href, page.url()).toString());
      expect(response.ok()).toBe(true);
      const bytes = (await response.body()).length;
      expect(bytes).toBeGreaterThan(0);
      expect(bytes).toBeLessThan(20_000);
    }
  });
});
