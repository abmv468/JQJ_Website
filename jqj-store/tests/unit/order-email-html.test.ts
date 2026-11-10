import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendOrderEmails, type OrderEmailData } from "@/lib/email";
import { formatPrice } from "@/lib/utils";

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

const CUSTOMER_TO = "ada@example.com";
const ADMIN_TO = "admin@example.com";

type SentMail = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
};

function order(overrides: Partial<OrderEmailData> = {}): OrderEmailData {
  return {
    orderId: "ord_123",
    customerName: "Ada Lovelace",
    customerEmail: CUSTOMER_TO,
    items: [{ name: "Amethyst Bracelet", quantity: 2, price: 25 }],
    subtotal: 50,
    shipping: 5,
    total: 55,
    paymentMethod: "stripe",
    currency: "USD",
    shippingAddress: {
      address: "12 Pearl Street",
      apartment: "Suite 4",
      city: "Austin",
      region: "TX",
      country: "US",
    },
    ...overrides,
  };
}

function sentTo(to: string): SentMail {
  const mail = sendMock.mock.calls
    .map((call) => call[0] as SentMail)
    .find((message) => message.to === to);
  expect(mail?.html).toEqual(expect.any(String));
  return mail as SentMail;
}

async function renderBoth(data: OrderEmailData) {
  await sendOrderEmails(data);
  return {
    customer: sentTo(CUSTOMER_TO),
    admin: sentTo(ADMIN_TO),
  };
}

describe("order email HTML", () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "email_test" }, error: null });
    vi.stubEnv("RESEND_API_KEY", "test_dummy");
    vi.stubEnv("ADMIN_EMAIL", ADMIN_TO);
    vi.stubEnv("EMAIL_FROM", "orders@example.com");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("unexpected network call");
      })
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("escapes a script-bearing customer name and an image-tag item name in both mails", async () => {
    const data = order({
      orderId: "ord_<id>",
      customerName: "<script>alert(1)</script>",
      items: [{ name: "<img src=x onerror=alert(1)>", quantity: 1, price: 25 }],
    });
    const { customer, admin } = await renderBoth(data);
    const total = formatPrice(data.total, { currency: data.currency });

    expect(customer.subject).toBe("Your JQD Group order ord_<id>");
    expect(admin.subject).toBe(`New order ord_<id> — ${total}`);

    for (const mail of [customer, admin]) {
      expect(mail.html).toContain("Hi &lt;script&gt;alert(1)&lt;/script&gt;,");
      expect(mail.html).toContain("&lt;img src=x onerror=alert(1)&gt; × 1");
      expect(mail.html).toContain("ord_&lt;id&gt;");
      expect(mail.html).not.toContain("<script");
      expect(mail.html).not.toContain("</script>");
      expect(mail.html).not.toContain("<img");
      expect(mail.html).not.toContain("ord_<id>");
      expect(mail.html).toContain(total);
      expect(mail.text).toBeUndefined();
    }

    expect(customer.html).toContain("Thank you for your order");
    expect(admin.html).toContain("New order received");
    expect(customer.html).not.toContain("New order received");
    expect(admin.html).not.toContain("Thank you for your order");
  });

  it("escapes & < > \" ' in an address line in both mails", async () => {
    const { customer, admin } = await renderBoth(
      order({
        shippingAddress: {
          address: `& < > " '`,
          apartment: "<apt>",
          city: "A & B",
          region: `"region"`,
          country: "Cote d'Ivoire",
        },
      })
    );

    for (const mail of [customer, admin]) {
      expect(mail.html).toContain("&amp; &lt; &gt; &quot; &#39;");
      expect(mail.html).toContain("&lt;apt&gt;");
      expect(mail.html).toContain("A &amp; B");
      expect(mail.html).toContain("&quot;region&quot;");
      expect(mail.html).toContain("Cote d&#39;Ivoire");
      expect(mail.html).not.toContain(`& < > " '`);
      expect(mail.html).not.toContain("<apt>");
      expect(mail.html).not.toContain("A & B");
      expect(mail.html).not.toContain(`"region"`);
      expect(mail.html).not.toContain("Cote d'Ivoire");
    }
  });

  it("leaves plain text, money, subjects, and the sender unchanged", async () => {
    const data = order({ codFee: 3, paymentMethod: "cod", total: 58 });
    const { customer, admin } = await renderBoth(data);
    const lineTotal = formatPrice(50, { currency: "USD" });
    const subtotal = formatPrice(50, { currency: "USD" });
    const shipping = formatPrice(5, { currency: "USD" });
    const codFee = formatPrice(3, { currency: "USD" });
    const total = formatPrice(58, { currency: "USD" });

    expect(customer.from).toBe("orders@example.com");
    expect(admin.from).toBe("orders@example.com");
    expect(customer.to).toBe(CUSTOMER_TO);
    expect(admin.to).toBe(ADMIN_TO);
    expect(customer.subject).toBe("Your JQD Group order ord_123");
    expect(admin.subject).toBe(`New order ord_123 — ${total}`);

    for (const mail of [customer, admin]) {
      expect(mail.html).toContain("Hi Ada Lovelace,");
      expect(mail.html).toContain("Amethyst Bracelet × 2");
      expect(mail.html).toContain("12 Pearl Street, Suite 4");
      expect(mail.html).toContain("Austin, TX");
      expect(mail.html).toContain("US");
      expect(mail.html).toContain("Cash on Delivery");
      expect(mail.html).toContain("COD Fee");
      expect(mail.html).toContain(lineTotal);
      expect(mail.html).toContain(subtotal);
      expect(mail.html).toContain(shipping);
      expect(mail.html).toContain(codFee);
      expect(mail.html).toContain(total);
      expect(mail.html).toContain("Thank you for choosing JQD Group.");
      expect(mail.text).toBeUndefined();
    }
  });

  it("renders null and undefined order text as empty, with the existing greeting fallback", async () => {
    const { customer, admin } = await renderBoth(
      order({
        customerName: undefined as unknown as string,
        shippingAddress: {
          address: null as unknown as string,
          apartment: undefined,
          city: undefined as unknown as string,
          region: "TX",
          country: "US",
        },
      })
    );

    for (const mail of [customer, admin]) {
      expect(mail.html).toContain("Hi there,");
      expect(mail.html).not.toContain("Hi null");
      expect(mail.html).not.toContain("Hi undefined");
      expect(mail.html).toContain(", TX");
      expect(mail.html).toContain("US");
      expect(mail.html).not.toContain("null");
      expect(mail.html).not.toContain("undefined");
    }
  });
});
