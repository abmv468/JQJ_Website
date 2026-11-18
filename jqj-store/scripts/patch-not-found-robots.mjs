// Next.js 14.2 injects <meta name="robots" content="noindex"> for 404 responses
// in addition to any robots metadata on not-found.tsx. That second tag cannot
// be removed through the Metadata API. Rewrite each injected tag to
// "noindex, nofollow" so a 404 emits one robots directive once page metadata
// leaves robots null.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const NOT_FOUND_ROBOTS = "noindex, nofollow";

export const NOT_FOUND_ROBOTS_FILES = [
  "dist/client/components/not-found-boundary.js",
  "dist/esm/client/components/not-found-boundary.js",
  "dist/server/app-render/make-get-server-inserted-html.js",
  "dist/esm/server/app-render/make-get-server-inserted-html.js",
  "dist/server/app-render/create-component-tree.js",
  "dist/esm/server/app-render/create-component-tree.js",
  "dist/server/app-render/app-render.js",
  "dist/esm/server/app-render/app-render.js",
];

// Production builds execute the prebundled runtime, not dist/server/app-render.
export const NOT_FOUND_ROBOTS_COMPILED_FILES = [
  "dist/compiled/next-server/app-page.runtime.prod.js",
  "dist/compiled/next-server/app-page.runtime.dev.js",
  "dist/compiled/next-server/app-page-turbo.runtime.prod.js",
  "dist/compiled/next-server/app-page-turbo-experimental.runtime.prod.js",
  "dist/compiled/next-server/app-page-experimental.runtime.prod.js",
  "dist/compiled/next-server/app-page-experimental.runtime.dev.js",
];

const COMPILED_BARE = '{name:"robots",content:"noindex"}';
const COMPILED_FIXED = `{name:"robots",content:"${NOT_FOUND_ROBOTS}"}`;

function bareRobots() {
  return /name:\s*"robots",(\s*)content:\s*"noindex"(?!,)/g;
}

export function patchNotFoundRobots(nextRoot) {
  const updated = [];
  for (const relative of NOT_FOUND_ROBOTS_FILES) {
    const file = path.join(nextRoot, relative);
    const source = readFileSync(file, "utf8");
    const next = source.replace(
      bareRobots(),
      `name: "robots",$1content: "${NOT_FOUND_ROBOTS}"`,
    );
    if (next === source) {
      if (!source.includes(`content: "${NOT_FOUND_ROBOTS}"`)) {
        throw new Error(`No 404 robots tag found in ${relative}`);
      }
      if (bareRobots().test(source)) {
        throw new Error(`Bare noindex robots tag remains in ${relative}`);
      }
      continue;
    }
    writeFileSync(file, next);
    updated.push(relative);
  }

  for (const relative of NOT_FOUND_ROBOTS_COMPILED_FILES) {
    const file = path.join(nextRoot, relative);
    const source = readFileSync(file, "utf8");
    if (!source.includes(COMPILED_BARE)) {
      if (!source.includes(COMPILED_FIXED)) {
        throw new Error(`No compiled 404 robots tag found in ${relative}`);
      }
      continue;
    }
    const next = source.replaceAll(COMPILED_BARE, COMPILED_FIXED);
    if (next.includes(COMPILED_BARE)) {
      throw new Error(`Bare noindex robots tag remains in ${relative}`);
    }
    writeFileSync(file, next);
    updated.push(relative);
  }
  return updated;
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const nextRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../node_modules/next",
  );
  const updated = patchNotFoundRobots(nextRoot);
  console.log(
    updated.length
      ? `patched 404 robots in ${updated.length} Next.js files`
      : "404 robots tags already patched",
  );
}
