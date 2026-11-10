export const SUPPORT_EMAIL = "support@jqdgroup.com";

export const EXPIRED_ORDER_LINK_HEADING = "This order link has expired";

export function expiredOrderLinkMessage(email: string = SUPPORT_EMAIL) {
  return `This order link is no longer active. Your order details are in your confirmation email — or contact us at ${email} and we'll be glad to help.`;
}

export function supportMailto(email: string = SUPPORT_EMAIL) {
  return `mailto:${email}`;
}
