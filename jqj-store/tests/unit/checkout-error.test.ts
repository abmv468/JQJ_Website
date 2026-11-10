import { afterEach, describe, expect, it, vi } from "vitest";
import { checkoutErrorResponse } from "@/lib/checkout-error";

describe("checkoutErrorResponse", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a plain message and reference code, and logs the internal error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("provider failed while talking to the upstream api");
    error.stack = "Error: provider failed\n    at hiddenFunction (internal.ts:10:4)";

    const response = checkoutErrorResponse("checkout-test", error);
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Something went wrong. Please try again.",
      reference: expect.stringMatching(/^[0-9a-f]{8}$/),
    });
    expect(serialized).not.toContain("provider failed");
    expect(serialized).not.toContain("hiddenFunction");
    expect(serialized).not.toContain("internal.ts");
    expect(serialized).not.toMatch(/UPS|Express|expedited/);

    const logged = spy.mock.calls.flat().map((part) => String(part)).join(" ");
    expect(logged).toContain(body.reference);
    expect(logged).toContain("provider failed");
  });
});
