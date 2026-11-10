const MAX_QUOTE_QUANTITY = 99;

export function isAcceptableQuoteQuantity(quantity: unknown): quantity is number {
  return (
    typeof quantity === "number" &&
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= MAX_QUOTE_QUANTITY
  );
}
