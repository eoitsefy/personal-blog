import type { Metadata } from "next";
import Link from "next/link";
import { buildPublicPostWhere, listHref, PUBLIC_POST_PAGE_SIZE } from "@/lib/post-query";
import { prisma } from "@/lib/prisma";
import { postListQuerySchema } from "@/lib/validators/post";
import "./posts.css";

export const metadata: Metadata = {
  title: "文章列表",
  description: "博客文章列表，支持关键词、分类和标签筛选。",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
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
  const total = await prisma.post.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PUBLIC_POST_PAGE_SIZE));
  const query = { ...initialQuery, page: Math.min(initialQuery.page, totalPages) };

  const [posts, categories, tags] = await Promise.all([
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
    <main className="posts-container">
      <header className="posts-header">
        <h1>文章列表</h1>
        <p>找到 {total} 篇已发布文章</p>
      </header>

      <form action="/posts" method="get" className="post-filters" aria-label="筛选文章">
        <label>
          <span>关键词</span>
          <input name="q" type="search" defaultValue={query.q} maxLength={80} placeholder="搜索标题、摘要或正文" />
        </label>
        <label>
          <span>分类</span>
          <select name="category" defaultValue={query.category}>
            <option value="">全部分类</option>
            {categories.map((category) => (
              <option key={category.slug} value={category.slug}>{category.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>标签</span>
          <select name="tag" defaultValue={query.tag}>
            <option value="">全部标签</option>
            {tags.map((tag) => (
              <option key={tag.slug} value={tag.slug}>{tag.name}</option>
            ))}
          </select>
        </label>
        <div className="filter-actions">
          <button type="submit">筛选</button>
          {isFiltered ? <Link href="/posts">清除</Link> : null}
        </div>
      </form>

      <section aria-label="文章列表">
        {posts.length === 0 ? (
          <p className="empty-state">没有符合条件的文章。</p>
        ) : (
          <ul className="posts-list">
            {posts.map((post) => (
              <li key={post.id} className="post-item">
                <article>
                  <h2><Link href={`/posts/${post.slug}`}>{post.title}</Link></h2>
                  {post.excerpt ? <p>{post.excerpt}</p> : null}
                  {post.category || post.tags.length ? (
                    <div className="post-taxonomy">
                      {post.category ? <span>{post.category.name}</span> : null}
                      {post.tags.map(({ tag }) => <span key={tag.slug}>#{tag.name}</span>)}
                    </div>
                  ) : null}
                  <small>发布于：{(post.publishedAt ?? post.createdAt).toLocaleDateString("zh-CN")}</small>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav aria-label="分页" className="pagination">
        {query.page <= 1 ? <span className="disabled">上一页</span> : <Link href={listHref(query, query.page - 1)}>上一页</Link>}
        <span>第 {query.page} / {totalPages} 页</span>
        {query.page >= totalPages ? <span className="disabled">下一页</span> : <Link href={listHref(query, query.page + 1)}>下一页</Link>}
      </nav>
    </main>
  );
}
