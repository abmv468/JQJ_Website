export const CARD_PAYMENTS_UNAVAILABLE_MESSAGE =
  "Card payments are temporarily unavailable — please choose cash on delivery or try again later.";

export function isCardPaymentsEnabled(): boolean {
  return process.env.CARD_PAYMENTS_ENABLED !== "false";
}
