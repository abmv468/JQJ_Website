import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The header search field used to take the global 3px outline offset and
 * paint it across the adjacent GO button. The ring now belongs to the form.
 */

const GOLD = /^rgb\(225,\s*193,\s*157\)$/;
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "compact", width: 820, height: 720 },
  { name: "sm", width: 640, height: 800 },
] as const;

type Box = { left: number; right: number; top: number; bottom: number };

type OutlineReading = {
  box: Box;
  outlineStyle: string;
  outlineWidth: number;
  outlineOffset: number;
  outlineColor: string;
};

function expand(box: Box, pad: number): Box {
  return {
    left: box.left - pad,
    right: box.right + pad,
    top: box.top - pad,
    bottom: box.bottom + pad,
  };
}

function intersection(a: Box, b: Box): Box {
  return {
    left: Math.max(a.left, b.left),
    right: Math.min(a.right, b.right),
    top: Math.max(a.top, b.top),
    bottom: Math.min(a.bottom, b.bottom),
  };
}

function area(box: Box): number {
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  if (width <= 0 || height <= 0) return 0;
  return width * height;
}

/** Positive when the boxes overlap on x. Flush neighbors can share a subpixel. */
function horizontalOverlap(a: Box, b: Box): number {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left);
}

/** Area of `target` that sits on a positive-offset outline frame. */
function frameOverlap(
  border: Box,
  offset: number,
  width: number,
  target: Box,
): number {
  if (width <= 0 || offset < 0) return 0;
  const outer = expand(border, offset + width);
  const hole = expand(border, offset);
  return area(intersection(outer, target)) - area(intersection(hole, target));
}

async function readOutline(locator: Locator): Promise<OutlineReading> {
  return locator.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const outlineWidth =
      style.outlineStyle === "none"
        ? 0
        : Number.parseFloat(style.outlineWidth) || 0;
    return {
      box: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      },
      outlineStyle: style.outlineStyle,
      outlineWidth,
      outlineOffset: Number.parseFloat(style.outlineOffset) || 0,
      outlineColor: style.outlineColor,
    };
  });
}

async function focusVisible(locator: Locator) {
  await locator.evaluate((el) => {
    if (!(el instanceof HTMLElement)) return;
    // This project's DOM lib predates FocusOptions.focusVisible.
    const focus = el.focus.bind(el) as (options?: {
      focusVisible?: boolean;
    }) => void;
    focus({ focusVisible: true });
  });
}

async function openSearch(page: Page) {
  await page.getByRole("button", { name: "Open search" }).click();
  const input = page.locator("#header-search-input");
  await expect(input).toBeFocused();
  await page.evaluate(() => document.fonts.ready);
  // The field enters with a short x/scale transition. A single early
  // "none" reading can land before that transition starts.
  await page.waitForTimeout(350);
  await expect
    .poll(() =>
      page.locator("#header-search-form").evaluate((el) => {
        const value = getComputedStyle(el).transform;
        if (value === "none") return true;
        const matrix = new DOMMatrix(value);
        return (
          Math.abs(matrix.a - 1) < 0.01 &&
          Math.abs(matrix.d - 1) < 0.01 &&
          Math.abs(matrix.e) < 0.5 &&
          Math.abs(matrix.f) < 0.5
        );
      }),
    )
    .toBe(true);
  return input;
}

test.beforeEach(async ({ page, baseURL }, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "viewports below cover the header search; mobile-chromium hides it",
  );

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
});

for (const viewport of VIEWPORTS) {
  test(`search focus ring stays off GO at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto("/");

    const cart = page.getByRole("button", { name: "Cart" });
    await focusVisible(cart);
    const cartOutline = await readOutline(cart);
    expect(cartOutline.outlineStyle).toBe("solid");
    expect(cartOutline.outlineWidth).toBe(2);
    expect(cartOutline.outlineOffset).toBe(3);
    expect(cartOutline.outlineColor).toMatch(GOLD);

    const input = await openSearch(page);
    const form = page.locator("#header-search-form");
    const go = form.locator("button[type='submit']");
    const searchIcon = page.getByRole("button", { name: "Close search" });
    const currency = page.getByRole("combobox", { name: "Currency" });

    const inputOutline = await readOutline(input);
    const formOutline = await readOutline(form);
    const goOutline = await readOutline(go);
    const iconBox = (await readOutline(searchIcon)).box;
    const currencyBox = (await readOutline(currency)).box;

    expect(inputOutline.outlineStyle).toBe("none");
    expect(inputOutline.outlineWidth).toBe(0);
    expect(goOutline.outlineStyle).toBe("none");
    expect(formOutline.outlineStyle).toBe("solid");
    expect(formOutline.outlineWidth).toBe(2);
    expect(formOutline.outlineOffset).toBe(3);
    expect(formOutline.outlineColor).toMatch(GOLD);

    expect(horizontalOverlap(inputOutline.box, goOutline.box)).toBeLessThan(1);
    expect(
      frameOverlap(
        formOutline.box,
        formOutline.outlineOffset,
        formOutline.outlineWidth,
        goOutline.box,
      ),
    ).toBeLessThan(0.5);
    expect(
      frameOverlap(
        formOutline.box,
        formOutline.outlineOffset,
        formOutline.outlineWidth,
        iconBox,
      ),
    ).toBeLessThan(0.5);
    expect(
      frameOverlap(
        formOutline.box,
        formOutline.outlineOffset,
        formOutline.outlineWidth,
        currencyBox,
      ),
    ).toBeLessThan(0.5);

    await focusVisible(go);
    await expect(go).toBeFocused();
    const goFocused = await readOutline(go);
    const inputWhileGo = await readOutline(input);
    const formWhileGo = await readOutline(form);

    expect(goFocused.outlineStyle).toBe("none");
    expect(goFocused.outlineWidth).toBe(0);
    // The field keeps Tailwind's transparent resting outline once focus
    // moves to GO. It must not keep the champagne ring.
    expect(inputWhileGo.outlineColor).not.toMatch(GOLD);
    expect(formWhileGo.outlineStyle).toBe("solid");
    expect(formWhileGo.outlineWidth).toBe(2);
    expect(formWhileGo.outlineOffset).toBe(3);
    expect(formWhileGo.outlineColor).toMatch(GOLD);
    expect(
      frameOverlap(
        formWhileGo.box,
        formWhileGo.outlineOffset,
        formWhileGo.outlineWidth,
        goFocused.box,
      ),
    ).toBeLessThan(0.5);
    expect(
      frameOverlap(
        formWhileGo.box,
        formWhileGo.outlineOffset,
        formWhileGo.outlineWidth,
        inputWhileGo.box,
      ),
    ).toBeLessThan(0.5);
    expect(horizontalOverlap(inputWhileGo.box, goFocused.box)).toBeLessThan(1);
  });
}

test("header search stays hidden below the sm breakpoint", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");

  const openSearch = page.locator("button[aria-label='Open search']");
  await expect(openSearch).toHaveCount(1);
  await expect(openSearch).toBeHidden();
  await expect(page.locator("#header-search-form")).toHaveCount(0);
  await expect(page.locator("#header-search-input")).toHaveCount(0);
});
