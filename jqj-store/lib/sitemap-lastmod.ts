/**
 * Per-URL lastmod for the XML sitemap.
 * Dates are content revisions, not one build-time stamp shared by every URL.
 * Pages edited in this preview share 2026-11-15. Shipping, returns, and privacy
 * were not edited here and keep the commit date of their current source.
 */
const PREVIEW_REVISION = "2026-11-15T07:09:00.000Z";

const LAST_MODIFIED: Record<string, string> = {
  "/": PREVIEW_REVISION,
  "/new": PREVIEW_REVISION,
  "/bracelets": PREVIEW_REVISION,
  "/necklaces": PREVIEW_REVISION,
  "/story": PREVIEW_REVISION,
  "/measure": PREVIEW_REVISION,
  "/care": PREVIEW_REVISION,
  "/faqs": PREVIEW_REVISION,
  "/contact": PREVIEW_REVISION,
  "/repair": PREVIEW_REVISION,
  "/terms": PREVIEW_REVISION,
  "/shipping": "2026-11-10T06:35:58.000Z",
  "/returns": "2026-11-10T06:35:58.000Z",
  "/privacy": "2026-07-29T00:16:07.000Z",
};

export function routeLastModified(path: string): Date {
  return new Date(LAST_MODIFIED[path] ?? PREVIEW_REVISION);
}
