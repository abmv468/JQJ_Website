/**
 * Cart and trust-strip copy.
 * Strings taken from WEB_COPY_2026-11-10 v4 are unmarked.
 * The free-shipping cart variant and any COD fee wording stay out of this module:
 * shipping logic and the fee label belong to other changes.
 */

/** WEB_COPY v4, trust line T2. */
export const SECURE_CHECKOUT_LABEL = "Secure checkout";

/** WEB_COPY v4 COD label. Fee wording is intentionally absent. */
export const CASH_ON_DELIVERY_LABEL = "Cash on delivery";

/** WEB_COPY v4 cart line for orders before free-shipping logic is live. */
export const CART_SHIPPING_LINE = "Shipping calculated at checkout";

// awaiting BRAND v4
/** Card schemes are text, not marks: WEB_COPY v4 does not name them and the repo has no official assets. Wallets are omitted because they are not confirmed on hosted checkout. */
export const CARD_NETWORK_LABELS = ["Visa", "Mastercard", "American Express"] as const;
