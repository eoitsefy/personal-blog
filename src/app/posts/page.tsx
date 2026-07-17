import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/site-shell";
import { buildPublicPostWhere, listHref, PUBLIC_POST_PAGE_SIZE } from "@/lib/post-query";
import { prisma } from "@/lib/prisma";
import { getUiPreviewPostList, isUiPreviewEnabled } from "@/lib/ui-preview";
import { postListQuerySchema } from "@/lib/validators/post";
import styles from "./posts.module.css";

export const metadata: Metadata = {
  title: "日志索引",
  description: "浏览全部日志，并按关键词、分类和标签筛选。",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export default async function PostsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const parsed = postListQuerySchema.safeParse({
    page: first(sp.page),
    q: first(sp.q),
    category: first(sp.category),
    tag: first(sp.tag),
  });
  const initialQuery = parsed.success ? parsed.data : postListQuerySchema.parse({});
  const where = buildPublicPostWhere(initialQuery);
  const previewEnabled = isUiPreviewEnabled();
  const previewInitial = previewEnabled
    ? getUiPreviewPostList(initialQuery, PUBLIC_POST_PAGE_SIZE)
    : null;
  const total = previewInitial?.total ?? await prisma.post.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PUBLIC_POST_PAGE_SIZE));
  const query = { ...initialQuery, page: Math.min(initialQuery.page, totalPages) };
  const previewData = previewEnabled
    ? getUiPreviewPostList(query, PUBLIC_POST_PAGE_SIZE)
    : null;

  const [posts, categories, tags] = previewData
    ? [previewData.posts, previewData.categories, previewData.tags]
    : await Promise.all([
        prisma.post.findMany({
          where,
          orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
          skip: (query.page - 1) * PUBLIC_POST_PAGE_SIZE,
          take: PUBLIC_POST_PAGE_SIZE,
          select: {
            id: true,
            slug: true,
            title: true,
            excerpt: true,
            publishedAt: true,
            createdAt: true,
            category: { select: { name: true, slug: true } },
            tags: { select: { tag: { select: { name: true, slug: true } } } },
          },
        }),
        prisma.category.findMany({
          where: { posts: { some: { status: "PUBLISHED", deletedAt: null } } },
          orderBy: { name: "asc" },
          select: { name: true, slug: true },
        }),
        prisma.tag.findMany({
          where: { posts: { some: { post: { status: "PUBLISHED", deletedAt: null } } } },
          orderBy: { name: "asc" },
          select: { name: true, slug: true },
        }),
      ]);

  const isFiltered = Boolean(query.q || query.category || query.tag);

  return (
    <div className={styles.page}>
      <div className={styles.archiveHeader}>
        <SiteHeader active="posts" />
        <div className={styles.headerGrid} aria-hidden="true" />
        <div className={styles.headerInner}>
          <div className={styles.headerCode}>
            <span>ARCHIVE INDEX</span>
            <b>EP / LOG</b>
          </div>
          <div>
            <p>ALL FIELD NOTES / 2026</p>
            <h1>日志索引</h1>
          </div>
          <div className={styles.headerCount}>
            <strong>{String(total).padStart(2, "0")}</strong>
            <span>篇公开记录</span>
          </div>
        </div>
      </div>

      <main className={styles.archive}>
        <form action="/posts" method="get" className={styles.filters} aria-label="筛选文章">
          <label className={styles.searchField}>
            <span>关键词 / KEYWORD</span>
            <div>
              <i aria-hidden="true" />
              <input
                name="q"
                type="search"
                defaultValue={query.q}
                maxLength={80}
                placeholder="搜索标题、摘要或正文"
              />
            </div>
          </label>
          <label>
            <span>分类 / CATEGORY</span>
            <select name="category" defaultValue={query.category}>
              <option value="">全部分类</option>
              {categories.map((category) => (
                <option key={category.slug} value={category.slug}>{category.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>标签 / TAG</span>
            <select name="tag" defaultValue={query.tag}>
              <option value="">全部标签</option>
              {tags.map((tag) => (
                <option key={tag.slug} value={tag.slug}>{tag.name}</option>
              ))}
            </select>
          </label>
          <div className={styles.filterActions}>
            <button type="submit">执行筛选 <span aria-hidden="true">→</span></button>
            {isFiltered ? <Link href="/posts">清除条件</Link> : null}
          </div>
        </form>

        <div className={styles.resultMeta}>
          <span>RESULT / {String(total).padStart(2, "0")}</span>
          <span>{isFiltered ? "当前显示筛选结果" : "按发布时间从新到旧排列"}</span>
        </div>

        <section aria-label="文章列表">
          {posts.length === 0 ? (
            <div className={styles.emptyState}>
              <span>NO SIGNAL / 00</span>
              <h2>没有找到符合条件的记录</h2>
              <p>可以换一个关键词，或清除分类与标签后重新查看。</p>
              {isFiltered ? <Link href="/posts">返回全部日志</Link> : null}
            </div>
          ) : (
            <ol className={styles.postsList}>
              {posts.map((post, index) => {
                const displayIndex = (query.page - 1) * PUBLIC_POST_PAGE_SIZE + index + 1;
                const publishDate = post.publishedAt ?? post.createdAt;
                return (
                  <li key={post.id} className={styles.postItem}>
                    <article>
                      <span className={styles.itemIndex}>{String(displayIndex).padStart(2, "0")}</span>
                      <div className={styles.itemBody}>
                        <div className={styles.itemMeta}>
                          <time dateTime={publishDate.toISOString()}>{formatDate(publishDate)}</time>
                          {post.category ? (
                            <Link href={`/posts?category=${encodeURIComponent(post.category.slug)}`}>
                              {post.category.name}
                            </Link>
                          ) : <span>未分类</span>}
                        </div>
                        <h2><Link href={`/posts/${post.slug}`}>{post.title}</Link></h2>
                        {post.excerpt ? <p>{post.excerpt}</p> : null}
                        {post.tags.length ? (
                          <div className={styles.tags} aria-label="文章标签">
                            {post.tags.map(({ tag }) => (
                              <Link href={`/posts?tag=${encodeURIComponent(tag.slug)}`} key={tag.slug}>
                                # {tag.name}
                              </Link>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <Link className={styles.readLink} href={`/posts/${post.slug}`} aria-label={`阅读《${post.title}》`}>
                        <span>READ</span>
                        <i aria-hidden="true">↗</i>
                      </Link>
                    </article>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <nav aria-label="分页" className={styles.pagination}>
          {query.page <= 1 ? (
            <span className={styles.disabled}>← 上一页</span>
          ) : (
            <Link href={listHref(query, query.page - 1)}>← 上一页</Link>
          )}
          <span className={styles.pageIndicator}>
            <b>{String(query.page).padStart(2, "0")}</b>
            <i />
            <span>{String(totalPages).padStart(2, "0")}</span>
          </span>
          {query.page >= totalPages ? (
            <span className={styles.disabled}>下一页 →</span>
          ) : (
            <Link href={listHref(query, query.page + 1)}>下一页 →</Link>
          )}
        </nav>
      </main>

      <SiteFooter />
    </div>
  );
}
