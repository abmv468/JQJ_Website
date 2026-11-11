import { AUTH_EMAIL_FROM_NAME, BRAND_EN, BRAND_MARK, BRAND_ZH, LEGAL_ENTITY, SUPPORT_EMAIL } from "./brand";

/**
 * Review HTML for the account-confirmation and password-reset emails.
 *
 * Not imported by lib/email.ts. Not sent through Resend. Not installed in
 * Supabase. Production mail stays on its current path.
 *
 * From-name to recommend, when a later approval chooses a mailbox:
 * Jewellery Quintessential, on an existing jqdgroup.com mailbox.
 * Do not invent a new mailbox.
 */

export type AuthEmailKind = "confirm" | "reset";

export interface AuthEmailReviewInput {
  kind: AuthEmailKind;
  actionUrl: string;
  termsUrl: string;
  privacyUrl: string;
  /** Relative or absolute directory that holds the three auth font files. */
  fontBase: string;
}

export const AUTH_EMAIL_REVIEW_SITE = "https://jqd.app";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

function safeHttpUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
  } catch {
    /* reject anything that is not an http(s) URL */
  }
  return "#";
}

export function authEmailSubject(kind: AuthEmailKind): string {
  if (kind === "confirm") return `Confirm your ${BRAND_EN} account`;
  return `Reset your ${BRAND_EN} password`;
}

export function authEmailActionLabel(kind: AuthEmailKind): string {
  if (kind === "confirm") return "Confirm your email";
  return "Reset your password";
}

function authEmailBody(kind: AuthEmailKind): string {
  if (kind === "confirm") {
    return `Please confirm your email to finish creating your ${BRAND_EN} account.`;
  }
  return `Please use the button below to choose a new password for your ${BRAND_EN} account.`;
}

function authEmailQuiet(kind: AuthEmailKind): string {
  if (kind === "confirm") {
    return "If you didn\u2019t create this account, you can ignore this email.";
  }
  return "If you didn\u2019t ask to reset your password, you can ignore this email.";
}

export function reviewEmailInput(kind: AuthEmailKind): AuthEmailReviewInput {
  const actionPath = kind === "confirm" ? "/auth/confirm" : "/auth/reset-password";
  return {
    kind,
    actionUrl: `${AUTH_EMAIL_REVIEW_SITE}${actionPath}`,
    termsUrl: `${AUTH_EMAIL_REVIEW_SITE}/terms`,
    privacyUrl: `${AUTH_EMAIL_REVIEW_SITE}/privacy`,
    fontBase: "../../assets/fonts",
  };
}

function fontFaceCss(fontBase: string): string {
  const base = escapeHtml(fontBase.replace(/\/$/, ""));
  return `
@font-face {
  font-family: "Instrument Sans";
  src: url("${base}/InstrumentSans-Variable.ttf") format("truetype");
  font-weight: 400 700;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Manrope";
  src: url("${base}/Manrope-Variable.ttf") format("truetype");
  font-weight: 200 800;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Noto Serif CJK TC JQ";
  src: url("${base}/NotoSerifCJKtc-JQ.otf") format("opentype");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}`;
}

export function renderAuthEmailReviewHtml(input: AuthEmailReviewInput): string {
  const subject = authEmailSubject(input.kind);
  const actionLabel = authEmailActionLabel(input.kind);
  const actionUrl = escapeHtml(safeHttpUrl(input.actionUrl));
  const termsUrl = escapeHtml(safeHttpUrl(input.termsUrl));
  const privacyUrl = escapeHtml(safeHttpUrl(input.privacyUrl));
  const title = escapeHtml(subject);
  const body = escapeHtml(authEmailBody(input.kind));
  const quiet = escapeHtml(authEmailQuiet(input.kind));
  const fromName = escapeHtml(AUTH_EMAIL_FROM_NAME);
  const support = escapeHtml(SUPPORT_EMAIL);

  return `<!DOCTYPE html>
<html lang="en" class="email">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
${fontFaceCss(input.fontBase)}
:root {
  --gold: #BB9D7B;
  --text: #F3F0EA;
  --ivory: #F7F3EE;
  --ink: #111111;
  --font-heading: "Instrument Sans", sans-serif;
  --font-body: "Manrope", sans-serif;
  --font-zh: "Noto Serif CJK TC JQ", "Noto Serif CJK TC", serif;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; border-radius: 0; }
html, body {
  min-height: 100%;
  background: #EDE8E1;
  color: var(--ink);
  font-family: var(--font-body);
  font-weight: 400;
  font-size: 16px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
a:focus-visible { outline: 2px solid #E1C19D; outline-offset: 3px; }
.wordmark {
  display: inline-flex;
  align-items: baseline;
  gap: 0;
  text-decoration: none;
  color: var(--text);
  line-height: 1.2;
}
.wordmark-en, .wordmark-dot {
  font-family: var(--font-heading);
  font-weight: 400;
  font-size: 15px;
  letter-spacing: 0.06em;
}
.wordmark-dot { padding: 0 0.55em; }
.wordmark-zh {
  font-family: var(--font-zh);
  font-weight: 400;
  font-size: 15px;
  letter-spacing: 0.12em;
  line-height: 1;
}
.email-stage {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  gap: 20px;
}
.email-meta {
  width: 100%;
  max-width: 560px;
  font-family: var(--font-body);
  font-size: 13px;
  color: #4a453f;
  line-height: 1.6;
}
.email-meta .k {
  display: inline-block;
  width: 4.5rem;
  color: #8a8174;
}
.email-shell {
  width: 100%;
  max-width: 560px;
  background: var(--ivory);
  border: 1px solid #e0d9d0;
}
.email-header {
  background: #010101;
  color: var(--text);
  padding: 28px 40px;
}
.email-header .wordmark-en,
.email-header .wordmark-dot,
.email-header .wordmark-zh {
  color: var(--text);
  font-size: 13px;
}
.email-body { padding: 40px 40px 28px; color: var(--ink); }
.email-body p {
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.7;
  color: var(--ink);
  margin: 0 0 28px;
}
.btn-email {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 220px;
  padding: 14px 28px;
  background: #BB9D7B;
  border: 1px solid #BB9D7B;
  color: #111111;
  font-family: var(--font-heading);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-decoration: none;
  text-transform: none;
}
.email-quiet {
  margin: 36px 0 0;
  font-family: var(--font-body);
  font-size: 13px;
  line-height: 1.65;
  color: #5c564e;
}
.email-footer {
  padding: 0 40px 36px;
  font-family: var(--font-body);
  font-size: 12px;
  line-height: 1.7;
  color: #5c564e;
}
.email-footer .rule {
  height: 1px;
  background: #e0d9d0;
  border: 0;
  margin: 0 0 20px;
}
.email-footer a {
  color: #111111;
  text-decoration: none;
  border-bottom: 1px solid #cfc6bb;
}
@media (max-width: 720px) {
  .email-stage { padding: 28px 12px; justify-content: flex-start; }
  .email-header, .email-body, .email-footer { padding-left: 22px; padding-right: 22px; }
  .email-header { padding-top: 22px; padding-bottom: 22px; }
  .btn-email { width: 100%; min-width: 0; }
}
  </style>
</head>
<body>
  <div class="email-stage">
    <div class="email-meta">
      <div><span class="k">From</span>${fromName}</div>
      <div><span class="k">Subject</span>${title}</div>
    </div>
    <article class="email-shell">
      <header class="email-header">
        <div class="wordmark" aria-label="${escapeHtml(BRAND_EN)} ${BRAND_ZH}">
          <span class="wordmark-en">${escapeHtml(BRAND_EN)}</span>
          <span class="wordmark-dot">${BRAND_MARK}</span>
          <span class="wordmark-zh" lang="zh-Hant">${BRAND_ZH}</span>
        </div>
      </header>
      <div class="email-body">
        <p>${body}</p>
        <a class="btn-email" href="${actionUrl}">${escapeHtml(actionLabel)}</a>
        <p class="email-quiet">${quiet}</p>
      </div>
      <footer class="email-footer">
        <hr class="rule">
        ${escapeHtml(LEGAL_ENTITY)}<br>
        <a href="mailto:${support}">${support}</a><br>
        <a href="${termsUrl}">Terms</a> ${BRAND_MARK} <a href="${privacyUrl}">Privacy</a>
      </footer>
    </article>
  </div>
</body>
</html>
`;
}
