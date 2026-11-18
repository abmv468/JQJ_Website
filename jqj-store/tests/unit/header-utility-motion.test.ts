import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function source(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

describe("header utility cluster motion", () => {
  const header = source("components/layout/Header.tsx");
  const clusterClass =
    'className="flex flex-1 items-center justify-end gap-2 sm:gap-3"';
  const clusterAt = header.indexOf(clusterClass);
  const clusterOpen = header.lastIndexOf("<m.div", clusterAt);
  const clusterTag = header.slice(clusterOpen, clusterAt + clusterClass.length);

  it("projects the sticky utility cluster from itself", () => {
    expect(clusterAt).toBeGreaterThan(-1);
    expect(clusterTag).toContain("layout");
    expect(clusterTag).toContain("layoutRoot");
    expect(header.slice(clusterOpen - 80, clusterOpen)).toContain(
      'reducedMotion="user"',
    );
  });

  it("keeps the search field transition separate from the cluster projection", () => {
    expect(header).toContain('key="header-search"');
    expect(header).toContain("{ opacity: 0, x: -10, scale: 0.98 }");
    expect(header).toContain("{ opacity: 0, x: -8, scale: 0.98 }");
    expect(header).toContain("shouldReduceMotion");
    expect(header).toContain(
      'aria-label={searchOpen ? "Close search" : "Open search"}',
    );
  });
});
