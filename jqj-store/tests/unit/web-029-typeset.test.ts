import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { paymentTestListingHidden } from "@/data/products";
import {
  formatCheckoutAddress,
  orderLines,
  paymentMethodLabel,
  settledRefundedAmount,
  sumOrderRevenue,
} from "@/lib/admin/order-view";
import {
  fullRefundRecorded,
  interpretRefundAttempt,
  isProviderBalanceFailure,
  orderAfterRefundAttempt,
  orderDisplayId,
  partialRefundRecorded,
  prepareRefundSubmit,
  REFUND_AMOUNT_REQUIRED,
  REFUND_FAILED_BALANCE,
  refundConfirmPrompt,
  remainingAfterThisRefund,
  remainingToRefund,
} from "@/lib/admin/refund-panel";
import {
  AIRWALLEX_SETTINGS_NOTE,
  HIDDEN_ON_SERVER,
  readAdminEmailLabel,
  readAdminSettingsFacts,
  readAirwallexModeLabel,
} from "@/lib/admin/settings-facts";
import { BRAND_EN, BRAND_ZH } from "@/lib/auth/brand";
import {
  meetsShownPasswordConditions,
  showPasswordRequirementCheck,
} from "@/lib/auth/password-rules";
import {
  PASSWORD_BREACHED,
  PASSWORD_TOO_EASY,
  PASSWORD_TOO_SHORT,
  PASSWORDS_DO_NOT_MATCH,
  plainAuthError,
} from "@/lib/auth/plain-error";

const root = path.resolve(process.cwd());

function source(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

const adminPage = () => source("app/admin/page.tsx");
const adminLayout = () => source("app/admin/layout.tsx");
const adminCss = () => source("app/admin/admin.css");
const resetForm = () => source("app/(auth)/auth/reset-password/reset-form.tsx");
const authCss = () => source("app/(auth)/auth/auth.css");
const passwordRules = () => source("lib/auth/password-rules.ts");

describe("admin settings facts", () => {
  it("reads Airwallex mode and the admin mailbox from the server env", () => {
    expect(readAirwallexModeLabel({ AIRWALLEX_ENV: "sandbox" })).toBe("Sandbox");
    expect(
      readAirwallexModeLabel({
        AIRWALLEX_ENV: "production",
        AIRWALLEX_PRODUCTION_ENABLED: "false",
      })
    ).toBe("Sandbox");
    expect(
      readAirwallexModeLabel({
        AIRWALLEX_ENV: "production",
        AIRWALLEX_PRODUCTION_ENABLED: "true",
      })
    ).toBe("Live");

    expect(readAdminEmailLabel({ ADMIN_EMAIL: "admin@jqdgroup.com" })).toBe("admin@jqdgroup.com");
    expect(readAdminEmailLabel({ ADMIN_EMAIL: "  admin@jqdgroup.com  " })).toBe("admin@jqdgroup.com");
    expect(readAdminEmailLabel({})).toBe(HIDDEN_ON_SERVER);
    expect(readAdminEmailLabel({ ADMIN_EMAIL: "   " })).toBe(HIDDEN_ON_SERVER);

    const facts = readAdminSettingsFacts({
      AIRWALLEX_ENV: "production",
      AIRWALLEX_PRODUCTION_ENABLED: "true",
      ADMIN_EMAIL: "admin@jqdgroup.com",
    });
    expect(facts.airwallexMode).toBe("Live");
    expect(facts.adminEmail).toBe("admin@jqdgroup.com");
    expect(facts.houseName).toBe(`${BRAND_EN} \u00b7 ${BRAND_ZH}`);
    expect(facts.legalEntity).toBe("JQD Group");
    expect(facts.currencies).toEqual(["USD", "EUR", "GBP", "CAD", "AUD"]);
    expect(facts.codFeeUsd).toBe(0);
    expect(facts.flatShippingUsd).toBe(15);
    expect(facts.adminEmail).not.toBe("Not set");
    expect(AIRWALLEX_SETTINGS_NOTE).toBe(
      "Airwallex mode is read from server settings. This screen does not change payment mode or keys."
    );
  });

  it("does not keep the hardcoded sandbox or Not set settings path", () => {
    const page = adminPage();
    const action = source("app/admin/settings-action.ts");
    expect(page).not.toContain("Not set");
    expect(page).not.toContain("Server-configured");
    expect(page).not.toContain(".env.local");
    expect(page).not.toContain("NEXT_PUBLIC_ADMIN_EMAIL");
    expect(page).toContain("loadAdminSettingsFacts");
    expect(page).toContain("settings.adminEmail");
    expect(page).toContain("settings.airwallexMode");
    expect(page).toContain("AIRWALLEX_SETTINGS_NOTE");
    expect(action).toContain("requireAdmin");
    expect(action).toContain("readAdminSettingsFacts");
    expect(action).not.toContain("AIRWALLEX_API_KEY");
    expect(action).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});

describe("refund panel honesty", () => {
  it("requires an amount and does not call the API when the field is empty", () => {
    expect(prepareRefundSubmit("", false)).toEqual({
      callApi: false,
      fieldError: REFUND_AMOUNT_REQUIRED,
      openConfirm: false,
    });
    expect(prepareRefundSubmit("   ", true)).toEqual({
      callApi: false,
      fieldError: REFUND_AMOUNT_REQUIRED,
      openConfirm: false,
    });
    expect(prepareRefundSubmit("0", true).callApi).toBe(false);
    expect(prepareRefundSubmit("nope", false).callApi).toBe(false);

    const unconfirmed = prepareRefundSubmit("48", false);
    expect(unconfirmed.callApi).toBe(false);
    if (unconfirmed.callApi) throw new Error("confirm step must not call the API");
    expect(unconfirmed.openConfirm).toBe(true);

    const confirmed = prepareRefundSubmit("48", true);
    expect(confirmed).toMatchObject({ callApi: true, amount: 48 });
  });

  it("uses a typographic confirm prompt instead of window.confirm", () => {
    expect(refundConfirmPrompt("$20.00", "ab12cd34")).toBe("Refund $20.00 on order ab12cd34?");
    const page = adminPage();
    expect(page).not.toContain("window.confirm");
    expect(page).toContain("refundConfirmPrompt");
    expect(page).toContain("prepareRefundSubmit");
    const submit = page.slice(page.indexOf("async function submitRefund"));
    const gate = submit.indexOf("if (!prepared.callApi)");
    const fetchAt = submit.indexOf('fetch("/api/admin/orders"');
    expect(gate).toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(gate);
  });

  it("shows partial success without flashing Fully refunded", () => {
    const message = partialRefundRecorded("$20.00", "ab12cd34");
    expect(message).toBe(
      "A refund of $20.00 has been recorded on order ab12cd34. The order is not fully refunded."
    );
    expect(message).not.toContain("Fully refunded");

    const attempt = interpretRefundAttempt({
      httpOk: true,
      refundStatus: "settled",
      previousRefunded: 0,
      nextRefunded: 20,
      total: 115,
      amountLabel: "$20.00",
      orderId: "ab12cd34",
      orderReturned: true,
    });
    expect(attempt.outcome).toBe("partial");
    expect(attempt.fullyRefunded).toBe(false);
    expect(attempt.message).toBe(message);
    expect(attempt.message).not.toContain("Fully refunded");
  });

  it("says fully refunded only after a confirmed refund leaves nothing remaining", () => {
    const attempt = interpretRefundAttempt({
      httpOk: true,
      refundStatus: "settled",
      previousRefunded: 80,
      nextRefunded: 115,
      total: 115,
      amountLabel: "$35.00",
      orderId: "ab12cd34",
      orderReturned: true,
    });
    expect(attempt.outcome).toBe("full");
    expect(attempt.fullyRefunded).toBe(true);
    expect(attempt.message).toBe(fullRefundRecorded("$35.00", "ab12cd34"));
    expect(remainingToRefund(115, 115)).toBe(0);
  });

  it("keeps a failed refund off the order and uses the locked copy", () => {
    expect(isProviderBalanceFailure("amount_above_limit")).toBe(true);
    expect(isProviderBalanceFailure("insufficient receivable")).toBe(true);
    expect(isProviderBalanceFailure("insufficient available balance")).toBe(true);

    for (const error of ["amount_above_limit", "insufficient receivable", "Not enough available balance"]) {
      const attempt = interpretRefundAttempt({
        httpOk: false,
        error,
        previousRefunded: 0,
        nextRefunded: 115,
        total: 115,
        amountLabel: "$115.00",
        orderId: "ab12cd34",
        orderReturned: false,
      });
      expect(attempt.outcome).toBe("failed");
      expect(attempt.fullyRefunded).toBe(false);
      expect(attempt.applyOrder).toBe(false);
      expect(attempt.message).toBe(REFUND_FAILED_BALANCE);
    }

    const failed = interpretRefundAttempt({
      httpOk: true,
      refundStatus: "failed",
      previousRefunded: 0,
      nextRefunded: 115,
      total: 115,
      amountLabel: "$115.00",
      orderId: "ab12cd34",
      orderReturned: true,
    });
    expect(failed.fullyRefunded).toBe(false);
    expect(failed.message).toBe(REFUND_FAILED_BALANCE);

    const previous = {
      status: "paid",
      fulfillment_status: "paid",
      refunded_amount: 0,
      payments: [] as Array<{ payment_refunds?: Array<{ status: string; amount: number }> }>,
    };
    const returned = {
      status: "refunded",
      fulfillment_status: "refunded",
      refunded_amount: 115,
      payments: [{ payment_refunds: [{ status: "failed", amount: 115 }] }],
    };
    const merged = orderAfterRefundAttempt(previous, returned, "failed");
    expect(merged.status).toBe("paid");
    expect(merged.fulfillment_status).toBe("paid");
    expect(merged.refunded_amount).toBe(0);
    expect(merged.payments?.[0].payment_refunds?.[0].status).toBe("failed");
    expect(settledRefundedAmount({
      refundedAmount: Number(merged.refunded_amount),
      providerRefunds: merged.payments?.[0].payment_refunds,
    })).toBe(0);
  });

  it("keeps the pre-confirm remaining out of the payment total", () => {
    expect(remainingToRefund(100, 20)).toBe(80);
    expect(remainingAfterThisRefund(80, 30)).toBe(50);
    const page = adminPage();
    const payment = page.indexOf('aria-label="Payment"');
    const refund = page.indexOf('aria-label="Refund"');
    expect(payment).toBeGreaterThan(-1);
    expect(refund).toBeGreaterThan(payment);
    expect(page.indexOf("Remaining after this refund")).toBeGreaterThan(refund);
    expect(page.indexOf('label="Remaining to refund"')).toBeGreaterThan(payment);
    expect(page.indexOf('label="Remaining to refund"')).toBeLessThan(refund);
  });
});

describe("admin order view", () => {
  it("sums revenue from order totals and does not subtract refunds", () => {
    expect(
      sumOrderRevenue([
        { total_amount: 100 },
        { total_amount: "15.50" },
      ])
    ).toBe(115.5);
    const page = adminPage();
    expect(page).toContain("sumOrderRevenue");
    expect(page).not.toContain("total_amount - ");
    expect(page).not.toContain("total_amount-");
  });

  it("reads line items and the checkout address, and keeps the live id display", () => {
    expect(orderDisplayId("ab12cd34-ffff-ffff-ffff-ffffffffffff")).toBe("ab12cd34");
    expect(
      orderLines([
        { id: "line-1", product_name: "Stone bead", sku: "JQ-BD-1", quantity: 2, price_at_purchase: 40 },
      ])
    ).toEqual([
      { id: "line-1", name: "Stone bead", sku: "JQ-BD-1", quantity: 2, amount: 80 },
    ]);
    expect(
      formatCheckoutAddress({
        address: "12 Market Street",
        apartment: "4",
        city: "Austin",
        region: "Texas",
        country: "United States",
        phone: "+1 512 555 0100",
        payment_method: "airwallex",
      })
    ).toEqual(["12 Market Street, 4", "Austin, Texas, United States", "+1 512 555 0100"]);
    expect(paymentMethodLabel({ paymentProvider: "cod" })).toBe("Cash on delivery");
    expect(paymentMethodLabel({ paymentMethod: "airwallex" })).toBe("Airwallex");
  });

  it("keeps the five tabs, the order panel sections, and the document locks", () => {
    const page = adminPage();
    const layout = adminLayout();
    expect(page).toContain('label: "Dashboard"');
    expect(page).toContain('label: "Products"');
    expect(page).toContain('label: "Orders"');
    expect(page).toContain('label: "Customers"');
    expect(page).toContain('label: "Settings"');
    expect(page).not.toContain("needs-attention");
    expect(page).not.toContain("lucide-react");
    expect(page).not.toContain("JQD Admin");
    expect(page).not.toContain("JQ-1842");
    expect(page).not.toContain("a.laurent@example.com");
    expect(page).not.toContain("JQJ-PAYTEST-001");
    expect(page).not.toContain("Example data");

    const items = page.indexOf('aria-label="Items"');
    const shipping = page.indexOf('aria-label="Shipping"');
    const payment = page.indexOf('aria-label="Payment"');
    const refund = page.indexOf('aria-label="Refund"');
    expect(items).toBeGreaterThan(-1);
    expect(shipping).toBeGreaterThan(items);
    expect(payment).toBeGreaterThan(shipping);
    expect(refund).toBeGreaterThan(payment);

    expect(layout).toContain('title: { absolute: "Admin — Jewellery Quintessential" }');
    expect(layout).toContain("index: false");
    expect(layout).toContain("follow: false");
    expect(adminCss()).toContain("#010101");
    expect(adminCss()).toContain("#0c0c0c");
    expect(adminCss()).toContain("#141414");
    expect(adminCss()).toContain("#BB9D7B");
    expect(adminCss()).toContain("#E1C19D");
    expect(adminCss()).toContain("#3E3E3E");
    expect(adminCss()).toContain("min-width: 1024px");
    expect(paymentTestListingHidden).toBe(true);
  });
});

describe("reset password check", () => {
  it("shows the check only when both shown conditions are met", () => {
    expect(meetsShownPasswordConditions("")).toBe(false);
    expect(meetsShownPasswordConditions("short")).toBe(false);
    expect(meetsShownPasswordConditions("password")).toBe(false);
    expect(meetsShownPasswordConditions("Password")).toBe(false);
    expect(meetsShownPasswordConditions("123456")).toBe(false);
    expect(meetsShownPasswordConditions("a-quiet-phrase")).toBe(true);
    expect(showPasswordRequirementCheck("a-quiet-phrase", null)).toBe(true);
    expect(showPasswordRequirementCheck("a-quiet-phrase", PASSWORD_TOO_EASY)).toBe(false);
    expect(showPasswordRequirementCheck("a-quiet-phrase", PASSWORD_BREACHED)).toBe(false);
    expect(showPasswordRequirementCheck("password", null)).toBe(false);
  });

  it("maps weak and breached auth replies and does not call a breach API", () => {
    expect(plainAuthError(new Error("Password is known to be weak and easy to guess"), "fallback")).toBe(
      PASSWORD_TOO_EASY
    );
    expect(plainAuthError(new Error("Password has appeared in a data breach"), "fallback")).toBe(
      PASSWORD_BREACHED
    );
    expect(PASSWORD_TOO_SHORT).toBe("Password must be at least 6 characters.");
    expect(PASSWORDS_DO_NOT_MATCH).toBe("Passwords do not match.");
    expect(PASSWORD_TOO_EASY).toBe("This password is too easy to guess. Choose a stronger one.");
    expect(PASSWORD_BREACHED).toBe("This password has appeared in a data breach. Choose a different one.");

    const form = resetForm();
    const rules = passwordRules();
    expect(form).toContain("At least 6 characters.");
    expect(form).toContain("Must not be a commonly used or leaked password.");
    expect(form).toContain("minLength={6}");
    expect(form).toContain("showPasswordRequirementCheck");
    expect(form).toContain("<RequirementCheck />");
    expect(form).not.toContain("haveibeenpwned");
    expect(form).not.toContain("pwnedpasswords");
    expect(rules).not.toContain("haveibeenpwned");
    expect(rules).not.toContain("pwnedpasswords");
    expect(rules).toContain("not a live HIBP check");
    expect(form).not.toMatch(/minLength=\{(?:[7-9]|\d{2,})\}/);

    const css = authCss();
    expect(css).toContain("color: var(--gold)");
    expect(css).toContain("#BB9D7B");
    expect(css).toContain("0.45s cubic-bezier(0.23, 1, 0.32, 1)");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("stroke-dashoffset: 0");
    expect(css).toContain("color: var(--gold-light)");
    expect(css).toContain("#E1C19D");
  });
});
