import { expect, test } from "@playwright/test";

/**
 * The utility cluster used to take the sticky header's scroll offset as
 * translateY for Framer's layout transition, then ease back. A check after
 * the animation finishes would pass either way, so samples run from the
 * click until the scroll reset has settled.
 *
 * Viewport is the compact desktop size from that repro (820×720): the
 * hamburger is on screen, and search, currency, Sign In, and cart are too.
 */

const MIN_SCROLL_PX = 300;
const ALIGN_PX = 12;
const TRANSFORM_PX = 12;
const LAYOUT_SETTLE_MS = 800;

type HeaderUtilityReading = {
  scrollY: number;
  headerTop: number;
  clusterTy: number;
  transform: string;
  centerDelta: number;
  menuDelta: number;
  clusterOutside: number;
};

type HeaderUtilitySample = HeaderUtilityReading & { t: number };

type HeaderUtilityMotion = {
  samples: HeaderUtilitySample[];
  clickAt: number | null;
  scrollResetAt: number | null;
  stop: boolean;
  raf: number;
};

declare global {
  interface Window {
    __readHeaderUtilityMotion?: () => HeaderUtilityReading | null;
    __headerUtilityMotion?: HeaderUtilityMotion;
  }
}

test.use({
  viewport: { width: 820, height: 720 },
  reducedMotion: "no-preference",
});

test.beforeEach(async ({ page, baseURL }) => {
  const appOrigin = new URL(baseURL ?? "http://127.0.0.1:3000").origin;
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith("data:") || url.startsWith("blob:")) {
      return route.continue();
    }
    try {
      if (new URL(url).origin === appOrigin) return route.continue();
    } catch {
      // Abort unparseable targets along with anything off-origin.
    }
    return route.abort("blockedbyclient");
  });

  await page.addInitScript(() => {
    function translateY(element: Element): number {
      const value = getComputedStyle(element).transform;
      if (!value || value === "none") return 0;
      return new DOMMatrix(value).m42;
    }

    function centerY(element: Element): number {
      const box = element.getBoundingClientRect();
      return box.top + box.height / 2;
    }

    function utilityCluster(cart: Element): HTMLElement | null {
      let node: Element | null = cart.parentElement;
      while (node && node !== document.body) {
        if (
          node instanceof HTMLElement &&
          node.classList.contains("justify-end") &&
          node.classList.contains("flex-1")
        ) {
          return node;
        }
        node = node.parentElement;
      }
      return null;
    }

    window.__readHeaderUtilityMotion = () => {
      const header = document.querySelector("header");
      const monogram = header?.querySelector(
        '[aria-label="Jewellery Quintessential home"]',
      );
      const menu = header?.querySelector('[aria-label="Open menu"]');
      const cart = header?.querySelector('[aria-label="Cart"]');
      if (!header || !monogram || !menu || !cart) return null;
      const cluster = utilityCluster(cart);
      if (!cluster) return null;

      const headerBox = header.getBoundingClientRect();
      const clusterBox = cluster.getBoundingClientRect();
      const monoY = centerY(monogram);
      return {
        scrollY: window.scrollY,
        headerTop: headerBox.top,
        clusterTy: translateY(cluster),
        transform: getComputedStyle(cluster).transform,
        centerDelta: centerY(cart) - monoY,
        menuDelta: centerY(menu) - monoY,
        clusterOutside: Math.max(
          0,
          clusterBox.top - headerBox.bottom,
          headerBox.top - clusterBox.bottom,
        ),
      };
    };
  });
});

test("scrolled home keeps the utility cluster with the monogram on a collection navigation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Jewellery Quintessential home" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open search" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Currency" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible();
  await page.waitForFunction(() => {
    const badge = document.querySelector(
      'header [aria-label="Cart"] span.absolute',
    );
    return badge?.textContent === "0";
  });

  const sodalite = page.getByRole("link", { name: /Sodalite Signature/ });
  await sodalite.scrollIntoViewIfNeeded();
  await sodalite.evaluate((link) => {
    const html = document.documentElement;
    const previous = html.style.scrollBehavior;
    html.style.scrollBehavior = "auto";
    const rect = link.getBoundingClientRect();
    const top =
      window.scrollY + rect.top - window.innerHeight / 2 + rect.height / 2;
    window.scrollTo(0, Math.max(0, top));
    html.style.scrollBehavior = previous;
  });

  const before = await page.evaluate(() =>
    window.__readHeaderUtilityMotion?.(),
  );
  expect(before, "header geometry before navigation").not.toBeNull();
  expect(before?.scrollY ?? 0).toBeGreaterThan(MIN_SCROLL_PX);
  expect(before?.headerTop ?? 99).toBeLessThanOrEqual(1);
  expect(Math.abs(before?.centerDelta ?? 99)).toBeLessThanOrEqual(ALIGN_PX);
  expect(Math.abs(before?.menuDelta ?? 99)).toBeLessThanOrEqual(ALIGN_PX);
  expect(Math.abs(before?.clusterTy ?? 99)).toBeLessThanOrEqual(TRANSFORM_PX);
  await expect(page.locator("header")).toHaveClass(/shadow-\[0_16px_40px/);

  await page.evaluate(() => {
    const state: HeaderUtilityMotion = {
      samples: [],
      clickAt: null,
      scrollResetAt: null,
      stop: false,
      raf: 0,
    };
    const tick = () => {
      if (state.stop) return;
      const reading = window.__readHeaderUtilityMotion?.() ?? null;
      if (reading) {
        const t = performance.now();
        state.samples.push({ t, ...reading });
        if (
          state.clickAt !== null &&
          state.scrollResetAt === null &&
          reading.scrollY < 1 &&
          location.pathname === "/bracelets" &&
          new URL(location.href).searchParams.get("stone") === "Sodalite"
        ) {
          state.scrollResetAt = t;
        }
      }
      state.raf = requestAnimationFrame(tick);
    };
    window.__headerUtilityMotion = state;
    state.raf = requestAnimationFrame(tick);
  });

  await page.evaluate(() => {
    const state = window.__headerUtilityMotion;
    if (state) state.clickAt = performance.now();
  });

  await Promise.all([
    page.waitForURL((url) => {
      return (
        url.pathname === "/bracelets" &&
        url.searchParams.get("stone") === "Sodalite"
      );
    }),
    sodalite.click(),
  ]);

  await expect(
    page.getByRole("heading", { name: "Bracelets", level: 1 }),
  ).toBeVisible();

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const state = window.__headerUtilityMotion;
          if (!state?.scrollResetAt) return 0;
          return performance.now() - state.scrollResetAt;
        }),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(LAYOUT_SETTLE_MS);

  const summary = await page.evaluate(() => {
    const state = window.__headerUtilityMotion;
    if (!state || state.clickAt === null) return null;
    state.stop = true;
    cancelAnimationFrame(state.raf);
    const after = state.samples.filter((sample) => sample.t >= state.clickAt!);
    const settled = after[after.length - 1];
    if (!settled || state.scrollResetAt === null) return null;

    let maxAbsClusterTy = 0;
    let maxAbsCenterDelta = 0;
    let maxAbsMenuDelta = 0;
    let maxClusterOutside = 0;
    let worstTransform = "none";
    for (const sample of after) {
      const absTy = Math.abs(sample.clusterTy);
      if (absTy >= maxAbsClusterTy) {
        maxAbsClusterTy = absTy;
        worstTransform = sample.transform;
      }
      maxAbsCenterDelta = Math.max(
        maxAbsCenterDelta,
        Math.abs(sample.centerDelta),
      );
      maxAbsMenuDelta = Math.max(maxAbsMenuDelta, Math.abs(sample.menuDelta));
      maxClusterOutside = Math.max(maxClusterOutside, sample.clusterOutside);
    }

    return {
      afterCount: after.length,
      maxAbsClusterTy,
      maxAbsCenterDelta,
      maxAbsMenuDelta,
      maxClusterOutside,
      worstTransform,
      settledClusterTy: settled.clusterTy,
      settledCenterDelta: settled.centerDelta,
      settledMenuDelta: settled.menuDelta,
      settledScrollY: settled.scrollY,
      elapsedAfterReset: performance.now() - state.scrollResetAt,
    };
  });

  expect(summary, "samples across the client navigation").not.toBeNull();
  expect(summary?.afterCount ?? 0).toBeGreaterThan(5);
  expect(
    summary?.maxAbsClusterTy ?? 999,
    `cluster translateY peaked at ${summary?.maxAbsClusterTy}px (${summary?.worstTransform})`,
  ).toBeLessThanOrEqual(TRANSFORM_PX);
  expect(
    summary?.maxAbsCenterDelta ?? 999,
    "cart stayed on the monogram midline",
  ).toBeLessThanOrEqual(ALIGN_PX);
  expect(
    summary?.maxAbsMenuDelta ?? 999,
    "hamburger stayed on the monogram midline",
  ).toBeLessThanOrEqual(ALIGN_PX);
  expect(summary?.maxClusterOutside ?? 999).toBeLessThanOrEqual(2);
  expect(Math.abs(summary?.settledClusterTy ?? 999)).toBeLessThanOrEqual(
    TRANSFORM_PX,
  );
  expect(Math.abs(summary?.settledCenterDelta ?? 999)).toBeLessThanOrEqual(
    ALIGN_PX,
  );
  expect(summary?.settledScrollY ?? 99).toBeLessThan(1);
  expect(summary?.elapsedAfterReset ?? 0).toBeGreaterThan(LAYOUT_SETTLE_MS);

  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open search" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Currency" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cart" })).toBeVisible();
  await expect(page.locator("#header-search-input")).toHaveCount(0);
  await expect(page).toHaveURL(/\/bracelets\?stone=Sodalite$/);
});
