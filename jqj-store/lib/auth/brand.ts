/** Customer-facing English house name, written in full. */
export const BRAND_EN = "Jewellery Quintessential";

/**
 * Chinese house name.
 * First character U+6975, second character U+6C23.
 */
export const BRAND_ZH = "\u6975\u6C23";

export const BRAND_MARK = "\u00B7";

export const BRAND_LOCKUP = `${BRAND_EN} ${BRAND_MARK} ${BRAND_ZH}`;

export const LEGAL_ENTITY = "JQD Group";

export const SUPPORT_EMAIL = "support@jqdgroup.com";

/**
 * Recommended From display name only.
 * When a later approval sends these messages, use this name on an existing
 * jqdgroup.com mailbox. Do not invent a new mailbox. This module is not wired
 * to Resend, Supabase, or lib/email.ts.
 */
export const AUTH_EMAIL_FROM_NAME = BRAND_EN;
