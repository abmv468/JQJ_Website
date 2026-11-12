import Link from "next/link";
import { JOURNAL_ARTICLE_FICTIONAL, type JournalPost } from "@/data/journal";

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
          <span aria-hidden="true"> · </span>
          {JOURNAL_ARTICLE_FICTIONAL}
        </p>
        <h1 className="journal-article-title">{post.title}</h1>
        <p className="journal-article-dek">{post.dek}</p>
        {post.body && post.body.length > 0 ? (
          <div className="journal-article-body">
            {post.body.map((block) =>
              block.type === "quote" ? (
                <blockquote key={block.text} className="journal-pull">
                  {block.text}
                </blockquote>
              ) : (
                <p key={block.text}>{block.text}</p>
              )
            )}
          </div>
        ) : null}
        <Link className="journal-back" href="/journal">
          Back to Journal
        </Link>
      </article>
    </div>
  );
}
