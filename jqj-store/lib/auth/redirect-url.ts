/** Same redirect base the auth pages already used: site URL, otherwise the current origin. */
export function authRedirectUrl(path: string, origin: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const base = siteUrl && siteUrl.length > 0 ? siteUrl : origin;
  return new URL(path, base).toString();
}
