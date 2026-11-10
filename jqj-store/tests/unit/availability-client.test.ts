import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "@/lib/availability-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchWithTimeout", () => {
  it("allows a same-origin path", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithTimeout("/api/x");

    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/x", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("rejects protocol-relative and absolute URLs before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWithTimeout("//evil.com")).rejects.toThrow(/same-origin path/);
    await expect(fetchWithTimeout("https://evil.com")).rejects.toThrow(/same-origin path/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts the request when the caller signal aborts", async () => {
    const controller = new AbortController();
    let passedSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: string, init?: RequestInit) => {
        passedSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) return;
          if (signal.aborted) {
            reject(new DOMException("The operation was aborted.", "AbortError"));
            return;
          }
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("The operation was aborted.", "AbortError")),
            { once: true }
          );
        });
      })
    );

    const pending = fetchWithTimeout("/api/x", { signal: controller.signal }, 60_000);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(passedSignal?.aborted).toBe(true);
    expect(controller.signal.aborted).toBe(true);
  });
});
