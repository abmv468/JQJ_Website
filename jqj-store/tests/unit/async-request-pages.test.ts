import { describe, expect, it } from "vitest";
import { generateMetadata as braceletsMetadata } from "@/app/(store)/bracelets/page";
import { generateMetadata as necklacesMetadata } from "@/app/(store)/necklaces/page";
import { generateMetadata as newMetadata } from "@/app/(store)/new/page";
import {
  generateMetadata as productMetadata,
  generateStaticParams,
} from "@/app/(store)/products/[slug]/page";

describe("async params and searchParams metadata", () => {
  it("awaits collection searchParams before deciding indexability", async () => {
    const filtered = await braceletsMetadata({
      searchParams: Promise.resolve({ stone: "Amethyst", tag: "new", q: "xv" }),
    });
    expect(filtered.robots).toEqual({ index: false, follow: true });
    expect(filtered.title).toBe("Natural Stone Bracelets");

    const unfiltered = await necklacesMetadata({
      searchParams: Promise.resolve({}),
    });
    expect(unfiltered.robots).toBeUndefined();
    expect(unfiltered.title).toBe("Gemstone Necklaces");

    const newest = await newMetadata({
      searchParams: Promise.resolve({ q: "pendant" }),
    });
    expect(newest.robots).toEqual({ index: false, follow: true });
    expect(newest.title).toBe("New Natural Stone Jewelry");
  });

  it("awaits product params for the catalogue metadata", async () => {
    expect(generateStaticParams().some((entry) => entry.slug === "amethyst-bracelet-xv")).toBe(
      true
    );

    const metadata = await productMetadata({
      params: Promise.resolve({ slug: "amethyst-bracelet-xv" }),
    });
    expect(metadata.title).toBe("Amethyst Bracelet XV (5mm)");
    expect(metadata.alternates?.canonical).toBe("/products/amethyst-bracelet-xv");
  });
});
