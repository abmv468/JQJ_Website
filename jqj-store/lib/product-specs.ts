export type SpecVariant = {
  size?: string | null;
  material?: string | null;
};

/**
 * Chain Length and Metal follow the selected variant when those spec keys exist.
 * Blue Lace Agate offers 45cm / 55cm and Sterling Silver / Gold Vermeil; the
 * static spec row used to stay on 55cm and Sterling Silver.
 */
export function displayedSpecs(
  specs: Record<string, string>,
  variant?: SpecVariant | null,
): Array<[string, string]> {
  return Object.entries(specs).map(([key, value]) => {
    if (key === "Chain Length" && variant?.size) return [key, variant.size];
    if (key === "Metal" && variant?.material) return [key, variant.material];
    return [key, value];
  });
}
