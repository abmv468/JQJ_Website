import { describe, expect, it } from "vitest";
import {
  BRAND_HASHTAG,
  BRAND_HOME_DESCRIPTION,
  BRAND_NAME,
  BRAND_NAME_FULL,
  BRAND_NAME_ZH,
  BRAND_OG_IMAGE_ALT,
  BRAND_SOCIAL_TITLE,
  BRAND_TITLE_DEFAULT,
  BRAND_TITLE_TEMPLATE,
  LEGAL_ENTITY,
  SUPPORT_EMAIL,
} from "@/lib/brand";

describe("brand names", () => {
  it("holds the locked name-table strings", () => {
    expect(BRAND_NAME).toBe("Jewellery Quintessential");
    expect(BRAND_NAME_FULL).toBe("Jewellery Quintessential · 極氣");
    expect(BRAND_NAME_ZH).toBe("極氣");
    expect(LEGAL_ENTITY).toBe("JQD Group");
    expect(BRAND_NAME_FULL).toBe(`${BRAND_NAME} · ${BRAND_NAME_ZH}`);
    expect(BRAND_NAME).not.toMatch(/Quintessence/);
    expect(BRAND_NAME_FULL).not.toMatch(/Quintessence/);
  });

  it("builds the home title, template, and Latin social title from those names", () => {
    expect(BRAND_TITLE_TEMPLATE).toBe("%s | Jewellery Quintessential");
    expect(BRAND_TITLE_DEFAULT).toBe(
      "Jewellery Quintessential · 極氣 | Natural Stone Jewellery"
    );
    expect(BRAND_SOCIAL_TITLE).toBe("Jewellery Quintessential | Natural Stone Jewellery");
    expect(BRAND_HOME_DESCRIPTION).toBe(
      "Jewellery Quintessential: natural stone and sterling silver jewellery designed in Hong Kong since 2015, with museum collaborations."
    );
    expect(BRAND_TITLE_DEFAULT).not.toMatch(/atelier|handmade|hand-made|hand-finished|worldwide/i);
    expect(BRAND_SOCIAL_TITLE).not.toMatch(/atelier|handmade|hand-made|hand-finished|worldwide/i);
    expect(BRAND_HOME_DESCRIPTION).not.toMatch(/atelier|handmade|hand-made|hand-finished|worldwide/i);
    expect(BRAND_HOME_DESCRIPTION).not.toContain(BRAND_NAME_ZH);
    expect(BRAND_SOCIAL_TITLE).not.toContain(BRAND_NAME_ZH);
    expect(SUPPORT_EMAIL).toBe("support@jqdgroup.com");
    expect(BRAND_OG_IMAGE_ALT).toBe("Jewellery Quintessential natural stone jewellery");
    expect(BRAND_HASHTAG).toBe("#jewelleryquintessential");
    expect(BRAND_SOCIAL_TITLE).not.toContain(BRAND_NAME_ZH);
    expect(BRAND_TITLE_DEFAULT.split(BRAND_NAME)).toHaveLength(2);
  });
});
