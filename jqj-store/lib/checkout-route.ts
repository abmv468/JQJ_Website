export function isCheckoutPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === "/checkout" || pathname.startsWith("/checkout/");
}
