import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AUTH_EMAIL_FROM_NAME, BRAND_EN, BRAND_ZH, SUPPORT_EMAIL } from "@/lib/auth/brand";
import { loginStatusMessage, readNoticeEmail } from "@/lib/auth/notice";
import { PASSWORDS_DO_NOT_MATCH, plainAuthError } from "@/lib/auth/plain-error";
import { authRedirectUrl } from "@/lib/auth/redirect-url";
import {
  authEmailActionLabel,
  authEmailSubject,
  renderAuthEmailReviewHtml,
  reviewEmailInput,
} from "@/lib/auth/transactional-email";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const AUTH_SOURCES = [
  "app/(auth)/auth",
  "components/auth",
  "emails/auth",
  "lib/auth/brand.ts",
  "lib/auth/notice.ts",
  "lib/auth/plain-error.ts",
  "lib/auth/redirect-url.ts",
  "lib/auth/transactional-email.ts",
];

const BANNED: RegExp[] = [
  /\bhandmade\b/i,
  /\bhand-finished\b/i,
  /\bhand finished\b/i,
  /\batelier\b/i,
  /\bcraftsmanship\b/i,
  /\bcrafted\b/i,
  /\bhandcrafted\b/i,
  /\bartisan\b/i,
  /\bartisanal\b/i,
  /\bchina\b/i,
  /\bexpress\b/i,
  /\bups\b/i,
  /\bdhl\b/i,
  /\bfedex\b/i,
  new RegExp(["quint", "essence"].join(""), "i"),
  new RegExp(String.fromCharCode(0x6977)),
];

function walk(relative: string): string[] {
  const absolute = path.join(root, relative);
  const stat = statSync(absolute);
  if (stat.isFile()) return [relative];
  return readdirSync(absolute).flatMap((entry) => walk(path.join(relative, entry)));
}

function source(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

describe("auth typeset lock", () => {
  it("uses the locked Chinese house name", () => {
    expect(BRAND_ZH).toBe("\u6975\u6C23");
    expect(BRAND_ZH.codePointAt(0)).toBe(0x6975);
    expect(BRAND_ZH.codePointAt(1)).toBe(0x6c23);
    expect(BRAND_EN).toBe("Jewellery Quintessential");
    expect(AUTH_EMAIL_FROM_NAME).toBe(BRAND_EN);
    expect(SUPPORT_EMAIL).toBe("support@jqdgroup.com");
  });

  it("keeps banned words and the wrong house name off these surfaces", () => {
    const files = AUTH_SOURCES.flatMap((entry) => walk(entry)).filter((file) =>
      /\.(ts|tsx|css|html|txt)$/.test(file)
    );
    expect(files.length).toBeGreaterThan(8);
    for (const file of files) {
      const text = source(file);
      for (const pattern of BANNED) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern);
      }
      expect(text, file).not.toContain(String.fromCharCode(0x6977));
    }
  });

  it("does not point order mail or Resend at the new templates", () => {
    const email = source("lib/email.ts");
    expect(email).not.toContain("transactional-email");
    expect(email).not.toContain("Confirm your email");
    expect(email).not.toContain("Reset your password");
    expect(email).not.toContain("\u6975");
    expect(source("lib/auth/transactional-email.ts")).not.toContain("resend");
    expect(source("lib/auth/transactional-email.ts")).not.toContain("sendOrderEmails");
  });
});

describe("auth contracts", () => {
  it("keeps the redirect base and the existing confirm and reset paths", () => {
    expect(authRedirectUrl("/auth/confirm", "http://127.0.0.1:3000")).toBe(
      "http://localhost:3000/auth/confirm"
    );
    expect(authRedirectUrl("/auth/reset-password", "http://127.0.0.1:3000")).toBe(
      "http://localhost:3000/auth/reset-password"
    );
  });

  it("reads only the inbox notices and the two existing login statuses", () => {
    expect(readNoticeEmail("confirm", "alex.wong@example.com", "confirm")).toBe(
      "alex.wong@example.com"
    );
    expect(readNoticeEmail("confirm", "not-an-email", "confirm")).toBeNull();
    expect(readNoticeEmail("reset", "alex.wong@example.com", "confirm")).toBeNull();
    expect(readNoticeEmail("reset", "ada@example.com", "reset")).toBe("ada@example.com");
    expect(loginStatusMessage("password-updated")).toBe(
      "Password updated. Sign in with your new password."
    );
    expect(loginStatusMessage("email-verified")).toBe("Email verified. You can now sign in.");
    expect(loginStatusMessage("<script>alert(1)</script>")).toBeNull();
    expect(loginStatusMessage("error")).toBeNull();
  });

  it("turns system strings into plain language and never echoes them", () => {
    const raw = "Invalid login credentials";
    const message = plainAuthError(new Error(raw), "fallback");
    expect(message).toBe("That email or password is incorrect.");
    expect(message).not.toContain(raw);

    expect(plainAuthError(new Error("User already registered"), "fallback")).toBe(
      "An account with this email already exists. Sign in instead."
    );
    expect(plainAuthError(new Error("Email not confirmed"), "fallback")).toContain("Confirm your email");
    expect(plainAuthError(new Error("sqlstate 23505 duplicate"), "We couldn\u2019t sign you in.")).toBe(
      "We couldn\u2019t sign you in."
    );
    expect(PASSWORDS_DO_NOT_MATCH).toBe("Passwords do not match.");
  });

  it("keeps sign-in, confirmation, and reset behaviour on the existing routes", () => {
    const login = source("app/(auth)/auth/login/login-form.tsx");
    expect(login).toContain("sanitizeNextPath");
    expect(login).toContain('router.push(nextPath)');
    expect(login).toContain('authRedirectUrl("/auth/confirm"');
    expect(login).toContain("signInWithPassword");
    expect(login).toContain("signUp");
    expect(login).toContain('type: "signup"');
    expect(login).not.toContain("err.message");

    const confirm = source("app/(auth)/auth/confirm/route.ts");
    expect(confirm).toContain("verifyOtp");
    expect(confirm).toContain("exchangeCodeForSession");
    expect(confirm).toContain("sanitizeNextPath");
    expect(confirm).toContain("/auth/verify?");
    expect(confirm).not.toContain("error.message");

    const verify = source("app/(auth)/auth/verify/page.tsx");
    expect(verify).toContain("Your email is confirmed");
    expect(verify).toContain("Welcome to Jewellery Quintessential.");
    expect(verify).toContain("We couldn");
    expect(verify).toContain("Continue");
    expect(verify).not.toContain("searchParams.message");

    const forgot = source("app/(auth)/auth/forgot-password/forgot-form.tsx");
    expect(forgot).toContain("resetPasswordForEmail");
    expect(forgot).toContain('authRedirectUrl("/auth/reset-password"');
    expect(forgot).toContain("Send reset link");
    expect(forgot).toContain("We sent a reset link to");

    const reset = source("app/(auth)/auth/reset-password/reset-form.tsx");
    expect(reset).toContain("updateUser");
    expect(reset).toContain("signOut");
    expect(reset).toContain('"/auth/login?status=password-updated"');
    expect(reset).toContain("Reset password");
    expect(reset).toContain('params.has("error_description")');
    expect(reset).not.toContain("decodeURIComponent");
    expect(reset).not.toContain("urlError");

    expect(statSync(path.join(root, "app/(store)/layout.tsx")).isFile()).toBe(true);
    expect(() => statSync(path.join(root, "app/(store)/auth/login/page.tsx"))).toThrow();
  });
});

describe("auth email review html", () => {
  it("matches the locked confirm and reset copy, and the files in the repo", () => {
    expect(authEmailSubject("confirm")).toBe("Confirm your Jewellery Quintessential account");
    expect(authEmailSubject("reset")).toBe("Reset your Jewellery Quintessential password");
    expect(authEmailActionLabel("confirm")).toBe("Confirm your email");
    expect(authEmailActionLabel("reset")).toBe("Reset your password");

    for (const kind of ["confirm", "reset"] as const) {
      const html = renderAuthEmailReviewHtml(reviewEmailInput(kind));
      const file = kind === "confirm" ? "emails/auth/confirm-account.html" : "emails/auth/reset-password.html";
      expect(html).toBe(source(file));
      expect(html).toContain("\u6975\u6C23");
      expect(html).not.toContain("\u6977");
      expect(html).toContain("#F7F3EE");
      expect(html).toContain("#010101");
      expect(html).toContain("#BB9D7B");
      expect(html).toContain("JQD Group");
      expect(html).toContain("mailto:support@jqdgroup.com");
      expect(html).toContain("text-transform: none");
      expect(html).not.toMatch(/text-transform:\s*uppercase/);
    }

    const confirm = renderAuthEmailReviewHtml(reviewEmailInput("confirm"));
    expect(confirm).toContain("Please confirm your email to finish creating your Jewellery Quintessential account.");
    expect(confirm).toContain("If you didn\u2019t create this account, you can ignore this email.");
    expect(confirm).toContain("https://jqd.app/auth/confirm");
    expect(confirm).toContain(">Confirm your email<");

    const reset = renderAuthEmailReviewHtml(reviewEmailInput("reset"));
    expect(reset).toContain(
      "Please use the button below to choose a new password for your Jewellery Quintessential account."
    );
    expect(reset).toContain("If you didn\u2019t ask to reset your password, you can ignore this email.");
    expect(reset).toContain(">Reset your password<");
  });

  it("drops non-http action urls", () => {
    const html = renderAuthEmailReviewHtml({
      ...reviewEmailInput("confirm"),
      actionUrl: "javascript:alert(1)",
    });
    expect(html).toContain('href="#"');
    expect(html).not.toContain("javascript:");
  });
});
