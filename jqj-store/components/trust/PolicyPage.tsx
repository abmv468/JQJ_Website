import Link from "next/link";

export type PolicyContactDetail = {
  label: string;
  value: string;
  href?: string;
};

export type PolicySection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

type PolicyPageProps = {
  title: string;
  intro: string;
  effectiveDate: string;
  contactDetails?: PolicyContactDetail[];
  sections: PolicySection[];
  disclaimer?: string;
};

export default function PolicyPage({
  title,
  intro,
  effectiveDate,
  contactDetails = [],
  sections,
  disclaimer,
}: PolicyPageProps) {
  return (
    <section className="bg-black py-14 md:py-20">
      <div className="container-site">
        <div className="mx-auto max-w-4xl space-y-10">
          <header className="space-y-4 border-b border-brand-border pb-8">
            <p className="font-heading text-xs uppercase tracking-wider2 text-brand-gold">
              Trust & Support
            </p>
            <h1 className="font-heading text-3xl uppercase tracking-wider2 text-white md:text-4xl">
              {title}
            </h1>
            <p className="text-sm leading-relaxed text-brand-muted md:text-base">
              {intro}
            </p>
          </header>

          <div className="rounded-brand border border-brand-border bg-brand-surface p-5 text-sm text-brand-muted md:p-6">
            <p>
              <span className="font-heading uppercase tracking-wider2 text-white">
                Effective Date:
              </span>{" "}
              {effectiveDate}
            </p>
            {contactDetails.length > 0 && (
              <ul className="mt-4 space-y-2">
                {contactDetails.map((detail) => (
                  <li key={detail.label}>
                    <span className="font-heading uppercase tracking-wider2 text-white">
                      {detail.label}:
                    </span>{" "}
                    {detail.href ? (
                      <Link
                        href={detail.href}
                        className="text-brand-gold transition-colors hover:text-brand-gold-light"
                      >
                        {detail.value}
                      </Link>
                    ) : (
                      detail.value
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-8">
            {sections.map((section) => (
              <article key={section.title} className="space-y-3">
                <h2 className="font-heading text-lg uppercase tracking-wider2 text-white">
                  {section.title}
                </h2>
                {section.paragraphs?.map((paragraph) => (
                  <p
                    key={`${section.title}-${paragraph.slice(0, 20)}`}
                    className="text-sm leading-relaxed text-brand-muted md:text-base"
                  >
                    {paragraph}
                  </p>
                ))}
                {section.bullets && (
                  <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-brand-muted md:text-base">
                    {section.bullets.map((bullet) => (
                      <li key={`${section.title}-${bullet.slice(0, 20)}`}>
                        {bullet}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>

          {disclaimer && (
            <p className="border-t border-brand-border pt-6 text-xs leading-relaxed text-brand-muted">
              {disclaimer}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
