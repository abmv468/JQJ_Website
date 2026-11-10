const DEV_SITE_URL = "http://localhost:3000";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export class CheckoutSiteUrlError extends Error {
  constructor() {
    super("Checkout site URL is not configured.");
    this.name = "CheckoutSiteUrlError";
  }
}

function isLocalHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return LOCAL_HOSTS.has(host);
}

/**
 * Absolute origin for checkout return URLs.
 * A localhost fallback is used only when the variable is missing outside production.
 */
export function resolveCheckoutSiteUrl(
  env: { siteUrl?: string | null; nodeEnv?: string } = {}
) {
  const nodeEnv = env.nodeEnv ?? process.env.NODE_ENV;
  const configured =
    env.siteUrl !== undefined ? env.siteUrl : process.env.NEXT_PUBLIC_SITE_URL;
  const raw = (configured ?? "").trim();

  if (!raw) {
    if (nodeEnv !== "production") return DEV_SITE_URL;
    throw new CheckoutSiteUrlError();
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new CheckoutSiteUrlError();
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new CheckoutSiteUrlError();
  }

  if (nodeEnv === "production" && isLocalHost(parsed.hostname)) {
    throw new CheckoutSiteUrlError();
  }

  const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
  return `${parsed.origin}${path}`;
}
