import type { Metadata } from "next";

const SHARE_IMAGE = "/products/hero-image.jpg";
const SHARE_IMAGE_ALT = "Jewellery Quintessential natural stone jewellery";

export const NOT_FOUND_TITLE = "Page not found — Jewellery Quintessential";
export const NOT_FOUND_DESCRIPTION =
  "The piece you are looking for may have moved or sold out.";

type PageSocial = {
  title: string;
  description: string;
  path?: string;
  /** Unresolved pages must not publish a social URL or the homepage share image. */
  unresolved?: boolean;
};

export function pageSocial({
  title,
  description,
  path,
  unresolved = false,
}: PageSocial): Pick<Metadata, "description" | "openGraph" | "twitter"> {
  return {
    description,
    openGraph: {
      title,
      description,
      ...(path && !unresolved ? { url: path } : {}),
      ...(unresolved
        ? {}
        : {
            images: [{ url: SHARE_IMAGE, alt: SHARE_IMAGE_ALT }],
          }),
    },
    twitter: {
      card: unresolved ? "summary" : "summary_large_image",
      title,
      description,
      ...(unresolved ? {} : { images: [SHARE_IMAGE] }),
    },
  };
}

export function pageTwitter(
  title: string,
  description: string,
): NonNullable<Metadata["twitter"]> {
  return {
    card: "summary_large_image",
    title,
    description,
    images: [SHARE_IMAGE],
  };
}
