import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckoutSiteUrlError, resolveCheckoutSiteUrl } from "@/lib/checkout-site-url";

describe("resolveCheckoutSiteUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed in production when the site URL is missing and does not build a localhost URL", () => {
    expect(() => resolveCheckoutSiteUrl({ siteUrl: "  ", nodeEnv: "production" })).toThrow(
      CheckoutSiteUrlError
    );
    expect(() => resolveCheckoutSiteUrl({ siteUrl: undefined, nodeEnv: "production" })).toThrow(
      CheckoutSiteUrlError
    );

    try {
      resolveCheckoutSiteUrl({ siteUrl: "", nodeEnv: "production" });
      throw new Error("expected the missing site URL to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CheckoutSiteUrlError);
      expect(String(error)).not.toMatch(/localhost|127\.0\.0\.1/i);
    }
  });

  it("fails closed in production when the site URL is invalid or local", () => {
    expect(() => resolveCheckoutSiteUrl({ siteUrl: "not a url", nodeEnv: "production" })).toThrow(
      CheckoutSiteUrlError
    );
    expect(() =>
      resolveCheckoutSiteUrl({ siteUrl: "ftp://jqd.app", nodeEnv: "production" })
    ).toThrow(CheckoutSiteUrlError);
    expect(() =>
      resolveCheckoutSiteUrl({ siteUrl: "http://localhost:3000", nodeEnv: "production" })
    ).toThrow(CheckoutSiteUrlError);
    expect(() =>
      resolveCheckoutSiteUrl({ siteUrl: "http://127.0.0.1:3000/store", nodeEnv: "production" })
    ).toThrow(CheckoutSiteUrlError);
  });

  it("uses a configured absolute URL in production", () => {
    expect(resolveCheckoutSiteUrl({ siteUrl: "https://jqd.app/", nodeEnv: "production" })).toBe(
      "https://jqd.app"
    );
  });

  it("falls back to localhost only outside production when the variable is missing", () => {
    expect(resolveCheckoutSiteUrl({ siteUrl: "", nodeEnv: "development" })).toBe(
      "http://localhost:3000"
    );
    expect(resolveCheckoutSiteUrl({ siteUrl: undefined, nodeEnv: "test" })).toBe(
      "http://localhost:3000"
    );
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(resolveCheckoutSiteUrl()).toBe("http://localhost:3000");
  });
});
