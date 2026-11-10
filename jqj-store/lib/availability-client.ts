/** Same AbortController + timer shape as fetchWithTimeout in lib/payments/airwallex.ts. */
export const AVAILABILITY_TIMEOUT_MS = 4_000;

function assertSameOriginPath(input: string) {
  if (!input.startsWith("/") || input.startsWith("//")) {
    throw new Error("Availability requests must use a same-origin path.");
  }
}

export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = AVAILABILITY_TIMEOUT_MS
): Promise<Response> {
  assertSameOriginPath(input);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const parentSignal = init.signal;

  if (parentSignal) {
    if (parentSignal.aborted) controller.abort();
    else parentSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
