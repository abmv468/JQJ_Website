export function sanitizeNextPath(nextPath: string | null | undefined, fallback = "/account") {
  if (!nextPath) return fallback;

  const trimmedPath = nextPath.trim();
  if (!trimmedPath.startsWith("/") || trimmedPath.startsWith("//") || trimmedPath.includes("\\")) {
    return fallback;
  }

  return trimmedPath;
}
