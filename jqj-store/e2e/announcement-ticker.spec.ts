import { expect, test, type Page } from "@playwright/test";

async function openHome(page: Page, baseURL: string | undefined) {
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

  const response = await page.goto("/");
  expect(response?.status()).toBeLessThan(400);
  await page.evaluate(() => document.fonts.ready);
}

async function readTicker(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector(".announcement-bar");
    const viewport = document.querySelector(".announcement-viewport");
    const track = document.querySelector(".announcement-track");
    const half = document.querySelector(".announcement-half");
    const set = document.querySelector(".announcement-set");
    if (!bar || !viewport || !track || !half || !set) return null;

    const tops = [...set.querySelectorAll("p")].map(
      (node) => node.getBoundingClientRect().top,
    );
    const style = getComputedStyle(track);

    return {
      height: bar.getBoundingClientRect().height,
      viewWidth: viewport.clientWidth,
      halfWidth: half.getBoundingClientRect().width,
      sets: track.getAttribute("data-sets"),
      rowSpread:
        tops.length === 0
          ? Number.POSITIVE_INFINITY
          : Math.max(...tops) - Math.min(...tops),
      text: set.textContent ?? "",
      animationName: style.animationName,
      animationDuration: style.animationDuration,
      animationTimingFunction: style.animationTimingFunction,
      playState: style.animationPlayState,
      transform: style.transform,
      marqueeCount: document.querySelectorAll("marquee").length,
    };
  });
}

function watchTransform(page: Page, durationMs: number) {
  return page.evaluate((duration) => {
    const track = document.querySelector(".announcement-track");
    if (!track) return { moved: false, stable: false };

    return new Promise<{ moved: boolean; stable: boolean }>((resolve) => {
      const first = getComputedStyle(track).transform;
      const start = performance.now();
      let moved = false;

      const frame = (now: number) => {
        const current = getComputedStyle(track).transform;
        if (current !== first) moved = true;
        if (now - start < duration) {
          requestAnimationFrame(frame);
          return;
        }
        resolve({ moved, stable: current === first });
      };

      requestAnimationFrame(frame);
    });
  }, durationMs);
}

async function waitForCoveringTicker(page: Page) {
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        return new Promise<boolean>((resolve) => {
          const read = () => {
            const viewport = document.querySelector(".announcement-viewport");
            const half = document.querySelector(".announcement-half");
            const track = document.querySelector(".announcement-track");
            if (!viewport || !half || !track) return null;
            return {
              sets: track.getAttribute("data-sets"),
              covered:
                half.getBoundingClientRect().width + 1 >= viewport.clientWidth,
            };
          };
          const first = read();
          if (!first?.covered) {
            resolve(false);
            return;
          }
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const second = read();
              resolve(
                Boolean(
                  second?.covered && second.sets === first.sets && second.sets,
                ),
              );
            });
          });
        });
      });
    })
    .toBe(true);
}

test("announcement ticker is one slow row and covers the viewport", async ({
  page,
  baseURL,
}, testInfo) => {
  await openHome(page, baseURL);
  const bar = page.getByRole("region", { name: "Announcements" });
  await expect(bar).toBeVisible();
  await expect(bar).toContainText(
    "Free worldwide shipping on orders over $250.00",
  );
  await expect(bar).toContainText(
    "Premium natural gemstones, selected for character",
  );
  await expect(bar).toContainText("Free resizing for new customers");

  await waitForCoveringTicker(page);

  const reading = await readTicker(page);
  expect(reading).not.toBeNull();
  expect(reading?.marqueeCount).toBe(0);
  expect(reading?.animationName).toBe("announcement-ticker");
  expect(reading?.animationDuration).toBe("40s");
  expect(reading?.animationTimingFunction).toBe("linear");
  expect(reading?.height).toBeGreaterThan(40);
  expect(reading?.height).toBeLessThan(52);
  expect(reading?.rowSpread).toBeLessThan(2);
  expect(reading?.halfWidth ?? 0).toBeGreaterThanOrEqual(
    (reading?.viewWidth ?? 0) - 1,
  );
  expect(reading?.text.indexOf("Free worldwide shipping")).toBeLessThan(
    reading?.text.indexOf("Premium natural gemstones") ?? -1,
  );
  expect(reading?.text.indexOf("Premium natural gemstones")).toBeLessThan(
    reading?.text.indexOf("Free resizing") ?? -1,
  );

  // Playwright's pointer starts at 0,0, which sits on this full-width bar.
  await page.mouse.move(320, 420);
  const moving = await watchTransform(page, 700);
  expect(moving.moved).toBe(true);
  const afterMove = await readTicker(page);
  expect(afterMove?.height).toBe(reading?.height);

  if (testInfo.project.name === "chromium") {
    await bar.hover();
    await expect
      .poll(async () => (await readTicker(page))?.playState)
      .toBe("paused");
    const paused = await watchTransform(page, 700);
    expect(paused.moved).toBe(false);
    expect(paused.stable).toBe(true);

    await page.mouse.move(320, 420);
    await bar.focus();
    await expect
      .poll(async () => (await readTicker(page))?.playState)
      .toBe("paused");
    const focused = await watchTransform(page, 700);
    expect(focused.moved).toBe(false);
    expect(focused.stable).toBe(true);
  }
});

test("wide desktop ticker copy is at least the viewport", async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await openHome(page, baseURL);
  await waitForCoveringTicker(page);

  const reading = await readTicker(page);
  expect(reading?.animationDuration).toBe("40s");
  expect(reading?.animationTimingFunction).toBe("linear");
  expect(reading?.rowSpread).toBeLessThan(2);
  expect(reading?.height).toBeLessThan(52);
  expect(reading?.halfWidth ?? 0).toBeGreaterThanOrEqual(
    (reading?.viewWidth ?? 1) - 1,
  );
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("announcement bar stays still and readable", async ({
    page,
    baseURL,
  }) => {
    await openHome(page, baseURL);
    const track = page.locator(".announcement-track");
    await expect(track).toBeVisible();

    const style = await track.evaluate((el) => {
      const computed = getComputedStyle(el);
      return {
        animationName: computed.animationName,
        transform: computed.transform,
      };
    });
    expect(style.animationName).toBe("none");
    const watched = await watchTransform(page, 700);
    expect(watched.moved).toBe(false);
    expect(watched.stable).toBe(true);

    const visible = await page.evaluate(() => {
      const shown = (selector: string) =>
        [...document.querySelectorAll(selector)].filter((element) => {
          if (getComputedStyle(element).display === "none") return false;
          return element.getClientRects().length > 0;
        }).length;
      return {
        sets: shown(".announcement-set"),
        seams: shown(".announcement-seam"),
      };
    });
    expect(visible.sets).toBe(1);
    expect(visible.seams).toBe(0);

    await expect(
      page.getByRole("region", { name: "Announcements" }),
    ).toContainText("Premium natural gemstones, selected for character");
    await expect(
      page.getByRole("region", { name: "Announcements" }),
    ).toContainText("Free worldwide shipping on orders over $250.00");
  });
});
