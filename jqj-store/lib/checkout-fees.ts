/** Cash-on-delivery fee in USD. Shared by the COD route and the checkout label. */
export const COD_FEE = 0;

/** Shared with the order summary's USD line (BE-007 / PR #15), so the wording lives in one place. */
export const CARD_CURRENCY_NOTICE = "Card payments are charged in USD";

/** BRAND v4 label. Render only when COD_FEE === 0. */
export const COD_FREE_LABEL = "Cash on delivery";

export function codPaymentLabel(fee: number, formattedFee: string): string {
  if (fee === 0) return COD_FREE_LABEL;
  return `Cash on Delivery (+${formattedFee} fee)`;
}
