import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SiteFooter, SiteHeader } from "@/components/site/site-shell";
import { prisma } from "@/lib/prisma";
import { isPublishedPost } from "@/lib/post-visibility";
import { getUiPreviewPost, isUiPreviewEnabled } from "@/lib/ui-preview";
import styles from "./post.module.css";

type PageProps = {
  params: Promise<{ slug: string }>;
};

const getPublishedPostBySlug = cache(async (slug: string) => {
  if (isUiPreviewEnabled()) {
    return getUiPreviewPost(slug);
  }

  const post = await prisma.post.findFirst({
    where: { slug, deletedAt: null },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      contentMd: true,
      status: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      author: { select: { id: true } },
      category: { select: { name: true, slug: true } },
      tags: { select: { tag: { select: { name: true, slug: true } } } },
    },
  });

  return isPublishedPost(post) ? post : null;
});

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function estimateReadingMinutes(markdown: string) {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[\s#>*_[\]()-]+/g, "");
  return Math.max(1, Math.ceil(text.length / 450));
}

export const revalidate = 60;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);

  if (!post) {
    return { title: "文章不存在", description: "你访问的文章不存在或尚未发布。" };
  }

  const description = post.excerpt ?? post.title;
  return {
    title: post.title,
    description,
    openGraph: {
      title: post.title,
      description,
      type: "article",
      publishedTime: post.publishedAt?.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      url: `/posts/${post.slug}`,
    },
  };
}

export default async function PostDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) notFound();

  const publishDate = post.publishedAt ?? post.createdAt;
  const readingMinutes = estimateReadingMinutes(post.contentMd);

  return (
    <div className={styles.page}>
      <SiteHeader tone="light" active="posts" />

      <header className={styles.articleHero}>
        <Image
          src="/images/journal/dawn-archive.png"
          alt="晨光下穿过旷野的原创移动城市与远行者"
          fill
          priority
          sizes="100vw"
          className={styles.heroImage}
        />
        <div className={styles.heroWash} />
        <div className={styles.heroGrid} aria-hidden="true" />

        <div className={styles.heroInner}>
          <Link href="/posts" className={styles.backLink}>← 返回日志索引</Link>
          <div className={styles.kicker}>
            <span>FIELD NOTE / PUBLIC</span>
            <span>EP / {publishDate.getFullYear()}</span>
          </div>
          <h1>{post.title}</h1>
          {post.excerpt ? <p>{post.excerpt}</p> : null}
          <div className={styles.heroMeta}>
            <div>
              <small>PUBLISHED</small>
              <time dateTime={publishDate.toISOString()}>{formatDate(publishDate)}</time>
            </div>
            <div>
              <small>READING TIME</small>
              <strong>约 {readingMinutes} 分钟</strong>
            </div>
            <div>
              <small>WRITTEN BY</small>
              <strong>EastherPhil</strong>
            </div>
          </div>
        </div>
      </header>

      <main className={styles.articleLayout}>
        <aside className={styles.articleAside} aria-label="文章信息">
          <div className={styles.asideBlock}>
            <span>CLASSIFICATION</span>
            {post.category ? (
              <Link href={`/posts?category=${encodeURIComponent(post.category.slug)}`}>
                {post.category.name} ↗
              </Link>
            ) : <b>未分类</b>}
          </div>
          {post.tags.length ? (
            <div className={styles.asideBlock}>
              <span>RELATED TAGS</span>
              <div className={styles.tagList}>
                {post.tags.map(({ tag }) => (
                  <Link key={tag.slug} href={`/posts?tag=${encodeURIComponent(tag.slug)}`}>
                    # {tag.name}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
          <div className={styles.asideBlock}>
            <span>LAST UPDATED</span>
            <time dateTime={post.updatedAt.toISOString()}>{formatDate(post.updatedAt)}</time>
          </div>
          <div className={styles.asideMark} aria-hidden="true">
            <i />
            <b>EP</b>
            <span>ARCHIVE</span>
          </div>
        </aside>

        <article className={styles.article}>
          <section className={styles.prose} aria-label="文章正文">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.contentMd}</ReactMarkdown>
          </section>

          <footer className={styles.articleEnd}>
            <span>END OF FIELD NOTE</span>
            <div className={styles.endRule}><i /></div>
            <Link href="/posts">继续浏览其他记录 →</Link>
          </footer>
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}
