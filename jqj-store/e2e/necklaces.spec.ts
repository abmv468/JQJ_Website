import { expect, test, type Page } from "@playwright/test";

const necklaces = [
  {
    slug: "pearl-silver-necklace-v",
    name: "Pearl - Silver Necklace V (7mm)",
    image: "pearl-silver-necklace.webp",
    chain: "45 cm",
    selector: false,
  },
  {
    slug: "labradorite-silver-pendant",
    name: "Labradorite Silver Pendant",
    image: "labradorite-pendant.webp",
    chain: "55 cm",
    selector: false,
  },
  {
    slug: "blue-lace-agate-silver-pendant",
    name: "Blue Lace Agate Silver Pendant",
    image: "blue-lace-agate-pendant.webp",
    chain: "45 cm or 55 cm",
    selector: true,
  },
] as const;

const droppedShots = [
  "pearl-silver-necklace-v-1",
  "pearl-silver-necklace-v-2",
  "blue-lace-agate-silver-pendant-1",
  "labradorite-silver-pendant-1",
  "bracelet",
];

async function silenceRemoteCalls(page: Page) {
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (
      url.includes("supabase.co") ||
      url.includes("127.0.0.1:54399") ||
      url.includes("airwallex.com")
    ) {
      return route.abort();
    }
    return route.continue();
  });
  await page.route(/\/api\/products\/availability$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ errors: [] }),
    })
  );
}

test.beforeEach(async ({ page }) => {
  await silenceRemoteCalls(page);
});

test("necklace pages hide wrist sizing and bracelet-only features", async ({ page }) => {
  for (const product of necklaces) {
    await page.goto(`/products/${product.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: product.name })).toBeVisible();
    await expect(page.getByLabel(/wrist size/i)).toHaveCount(0);
    await expect(page.getByText("Tailored for your preferred fit")).toHaveCount(0);
    await expect(page.getByText(/complimentary first resize/i)).toHaveCount(0);

    const src = decodeURIComponent((await page.locator(".aspect-square img").first().getAttribute("src")) ?? "");
    expect(src).toContain(product.image);
    for (const shot of droppedShots) {
      expect(src.toLowerCase()).not.toContain(shot);
    }

    if (product.selector) {
      const options = page.locator("#variant option");
      await expect(options).toHaveCount(3);
      const labels = (await options.allTextContents()).join(" ");
      expect(labels).toContain("45cm / Sterling Silver");
      expect(labels).toContain("55cm / Sterling Silver");
      expect(labels).toContain("55cm / Gold Vermeil");
      await expect(page.getByText("Chain length", { exact: true })).toHaveCount(0);
    } else {
      await expect(page.locator("#variant")).toHaveCount(0);
      await expect(page.getByText("Chain length", { exact: true })).toBeVisible();
      await expect(page.getByText(product.chain, { exact: true })).toBeVisible();
    }
  }
});

test("Pearl specifications show hematite spacers and no clasp", async ({ page }) => {
  await page.goto("/products/pearl-silver-necklace-v");
  await page.getByRole("button", { name: "Specifications" }).click();
  await expect(page.getByText(/Spacers: Hematite/)).toBeVisible();
  await expect(page.getByText(/Chain Length: 45 cm/)).toBeVisible();
  await expect(page.getByText(/clasp/i)).toHaveCount(0);
  await expect(page.getByText(/vermeil/i)).toHaveCount(0);
});

test("Blue Lace copy describes a bar pendant on a curb chain", async ({ page }) => {
  await page.goto("/products/blue-lace-agate-silver-pendant");
  await expect(page.getByText(/flat bar/i)).toBeVisible();
  await expect(page.getByText(/curb chain/i)).toBeVisible();
  await expect(page.getByText(/box chain|teardrop|round pendant/i)).toHaveCount(0);
  await expect(page.getByText(/clasp/i)).toHaveCount(0);
});

test("a bracelet without variants still asks for wrist size", async ({ page }) => {
  await page.goto("/products/amethyst-bracelet-xv");
  await expect(page.getByLabel(/wrist size/i)).toBeVisible();
  await expect(page.getByText("Tailored for your preferred fit")).toBeVisible();
  await expect(page.getByText(/first resize/i)).toHaveCount(0);
});

test("every rendered mega-menu link lists at least one product", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const hrefs = new Set<string>();
  for (const [label, card] of [
    ["Necklaces", "All Necklaces"],
    ["Bracelets", "All Bracelets"],
  ] as const) {
    await page.getByRole("navigation").getByRole("link", { name: label, exact: true }).click();
    const panel = page.locator("header .border-t").filter({ hasText: card });
    await expect(panel).toBeVisible();
    const found = await panel.locator("a").evaluateAll((anchors) =>
      anchors
        .map((anchor) => anchor.getAttribute("href"))
        .filter((href): href is string => Boolean(href))
    );
    expect(found.length).toBeGreaterThan(1);
    found.forEach((href) => hrefs.add(href));
    await page.keyboard.press("Escape");
  }

  for (const href of hrefs) {
    await page.goto(href);
    await expect(page.getByText("No products match your search and filters.")).toHaveCount(0);
    await expect(page.locator('a[href^="/products/"]')).not.toHaveCount(0);
  }
});

test("necklace gems are the stones that have necklaces", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/necklaces");
  const gems = page.locator("aside");
  await expect(gems.getByRole("button", { name: "Freshwater Pearl", exact: true })).toBeVisible();
  await expect(gems.getByRole("button", { name: "Labradorite", exact: true })).toBeVisible();
  await expect(gems.getByRole("button", { name: "Blue Lace Agate", exact: true })).toBeVisible();
  await expect(gems.getByRole("button", { name: "Aquamarine", exact: true })).toHaveCount(0);
  await expect(gems.getByRole("button", { name: "Tiger Eye", exact: true })).toHaveCount(0);
  await expect(gems.getByRole("button", { name: "Lapis Lazuli", exact: true })).toHaveCount(0);
});
