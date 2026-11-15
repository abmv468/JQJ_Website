import Image from "next/image";
import Link from "next/link";
import type { JournalBlock, JournalPost, JournalRelatedLink } from "@/data/journal";

function ArticleBlock({ block }: { block: JournalBlock }) {
  switch (block.type) {
    case "heading":
      return <h2 className="journal-subhead">{block.text}</h2>;
    case "quote":
      return <blockquote className="journal-pull">{block.text}</blockquote>;
    case "list":
      return (
        <ul className="journal-article-list">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "paragraph":
      return <p>{block.text}</p>;
  }
}

function RelatedLinks({ links }: { links: readonly JournalRelatedLink[] }) {
  if (links.length === 0) return null;

  return (
    <p className="journal-related">
      {links.map((link, index) => (
        <span key={link.href}>
          {index > 0 ? (
            <span className="journal-related-sep" aria-hidden="true">
              {" · "}
            </span>
          ) : null}
          <a href={link.href}>{link.label}</a>
        </span>
      ))}
    </p>
  );
}

export default function JournalArticle({ post }: { post: JournalPost }) {
  return (
    <div className="journal-main">
      <article className="container-site journal-article">
        <p className="journal-breadcrumb">
          <Link href="/journal">Journal</Link>
          <span className="journal-breadcrumb-sep" aria-hidden="true">
            /
          </span>
          {post.title}
        </p>
        <p className="eyebrow journal-article-eyebrow">
          <time dateTime={post.dateTime}>{post.displayDate}</time>
        </p>
        <h1 className="journal-article-title">{post.title}</h1>
        <p className="journal-article-dek">{post.dek}</p>
        <Image
          className="journal-still"
          src={post.still.src}
          alt={post.still.alt}
          width={2048}
          height={1360}
          sizes="(min-width: 768px) 42rem, 100vw"
          priority
          unoptimized
        />
        {post.body && post.body.length > 0 ? (
          <div className="journal-article-body">
            {post.body.map((block, index) => (
              <ArticleBlock key={index} block={block} />
            ))}
          </div>
        ) : null}
        <RelatedLinks links={post.related} />
        <Link className="journal-back" href="/journal">
          Back to Journal
        </Link>
      </article>
    </div>
  );
}
