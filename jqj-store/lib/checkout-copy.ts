/**
 * Checkout chrome and confirmation copy for WEB-009.
 * Strings quoted from BRAND v4 (WEB_COPY_2026-11-10) are unmarked.
 * The support address lives in lib/support.ts.
 */

export const CHECKOUT_LOGO_ALT = "Jewellery Quintessential · 極氣";
export const CHECKOUT_LOGO_HOME_LABEL = "Jewellery Quintessential home";

/** BRAND v4 T2: the phrase "Secure checkout" is the approved lock label. */
export const SECURE_CHECKOUT_LABEL = "Secure checkout";

// awaiting BRAND v4 — v4 has no checkout back-link label
export const BACK_TO_BAG_LABEL = "Back to bag";
export const BACK_TO_BAG_HREF = "/cart";

// awaiting BRAND v4 — v4 does not name these minimal checkout footer links
export const CHECKOUT_POLICY_LINKS = [
  { href: "/returns", label: "Returns" },
  { href: "/shipping", label: "Shipping" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

// awaiting BRAND v4 — confirmation states are not in WEB_COPY_2026-11-10
export const confirmationCopy = {
  loading: "Loading…",
  verifying: "Verifying your payment status…",
  confirming: "Confirming your order…",
  pendingTitle: "Payment verification pending",
  pendingBody:
    "We received your return from Airwallex, but payment confirmation is still pending.",
  pendingSupportLead: "If this status does not update after a few minutes, contact",
  pendingSupportTail: "and include your order reference.",
  cancelledTitle: "Payment was cancelled",
  failedTitle: "Payment was not completed",
  invalidTitle: "We couldn't confirm your order",
  cancelledBody: "You can return to checkout to try again.",
  chargedBody: "If you were charged, please contact support with your payment details.",
  supportLead: "If you continue to have issues, contact",
  supportTail: "and include your order reference.",
  orderReferenceLabel: "Order reference:",
  thankYou: "Thank you for your order",
  codSuccess: "Your Cash on Delivery order has been placed.",
  airwallexSuccess: "Your Airwallex payment was successful.",
  paymentSuccess: "Your payment was successful.",
  emailOnTheWay: "A confirmation email is on its way to your inbox.",
  checkPaymentStatus: "Check Payment Status",
  returnToCheckout: "Return to Checkout",
  recheckStatus: "Re-check Status",
  continueShopping: "Continue Shopping",
  viewOrders: "View Orders",
} as const;
