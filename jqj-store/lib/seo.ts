const DEFAULT_SITE_URL = "https://jqd.app";

function getSiteUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL;
  return configuredUrl.replace(/\/$/, "");
}

export const siteUrl = new URL(getSiteUrl());

export function absoluteUrl(path = "/") {
  return new URL(path, siteUrl).toString();
}

export function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}