import { describe, expect, it } from "vitest";
import { isValidSingleEmail, normalizeSingleEmail } from "@/lib/email-address";

describe("isValidSingleEmail", () => {
  it("accepts one trimmed mailbox with a dotted domain", () => {
    expect(normalizeSingleEmail("  buyer@example.com \n")).toBe("buyer@example.com");
    expect(isValidSingleEmail("buyer@example.com")).toBe(true);
    expect(isValidSingleEmail("  buyer@example.com  ")).toBe(true);
    expect(isValidSingleEmail("first.last@mail.example.co.uk")).toBe(true);
  });

  it("rejects a@x.com,evil.com", () => {
    expect(isValidSingleEmail("a@x.com,evil.com")).toBe(false);
    expect(isValidSingleEmail("a@x.com, b@y.com")).toBe(false);
  });

  it("rejects separators, line breaks, whitespace, and control characters", () => {
    expect(isValidSingleEmail("a@x.com;b@y.com")).toBe(false);
    expect(isValidSingleEmail("buyer@example.com\nBcc:evil@example.com")).toBe(false);
    expect(isValidSingleEmail("buyer@example.com\r\nBcc:evil@example.com")).toBe(false);
    expect(isValidSingleEmail("buyer @example.com")).toBe(false);
    expect(isValidSingleEmail("buy\ter@example.com")).toBe(false);
    expect(isValidSingleEmail("buyer@example.com\u0000")).toBe(false);
    expect(isValidSingleEmail("buyer@example.com\u0007")).toBe(false);
    expect(isValidSingleEmail("buyer@exa\u00a0mple.com")).toBe(false);
    expect(isValidSingleEmail(`buyer@example.com${String.fromCharCode(127)}`)).toBe(false);
  });

  it("rejects an empty value and anything that is not one local@domain", () => {
    expect(isValidSingleEmail("")).toBe(false);
    expect(isValidSingleEmail("   ")).toBe(false);
    expect(isValidSingleEmail("not-an-email")).toBe(false);
    expect(isValidSingleEmail("buyer@localhost")).toBe(false);
    expect(isValidSingleEmail("@example.com")).toBe(false);
    expect(isValidSingleEmail("buyer@")).toBe(false);
    expect(isValidSingleEmail("a@b@example.com")).toBe(false);
    expect(isValidSingleEmail("buyer@example.")).toBe(false);
    expect(isValidSingleEmail("buyer@.example.com")).toBe(false);
    expect(isValidSingleEmail("buyer@example..com")).toBe(false);
  });

  it("caps the address at 254 characters", () => {
    const accepted = `a@${"b".repeat(249)}.co`;
    const rejected = `a@${"b".repeat(250)}.co`;
    expect(accepted).toHaveLength(254);
    expect(rejected).toHaveLength(255);
    expect(isValidSingleEmail(accepted)).toBe(true);
    expect(isValidSingleEmail(`  ${accepted}  `)).toBe(true);
    expect(isValidSingleEmail(rejected)).toBe(false);
  });
});
