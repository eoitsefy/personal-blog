import type { Metadata } from "next";
import Link from "next/link";
import { PostStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { postListQuerySchema } from "@/lib/validators/post";
import "./posts.css";

const PAGE_SIZE = 10;

export const metadata: Metadata = {
  title: "文章列表",
  description: "博客文章列表页，展示已发布内容。",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PostsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const parsed = postListQuerySchema.safeParse({
    page: Array.isArray(sp.page) ? sp.page[0] : sp.page,
  });

  const page = parsed.success ? parsed.data.page : 1;
  const skip = (page - 1) * PAGE_SIZE;

  const [total, posts] = await Promise.all([
    prisma.post.count({
      where: { status: PostStatus.PUBLISHED },
    }),
    prisma.post.findMany({
      where: { status: PostStatus.PUBLISHED },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: PAGE_SIZE,
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        publishedAt: true,
        createdAt: true,
        author: {
          select: { email: true },
        },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="posts-container">
      <header className="posts-header">
        <h1>文章列表</h1>
        <p>共 {total} 篇已发布文章</p>
      </header>

      <section aria-label="文章列表">
        {posts.length === 0 ? (
          <p>暂无已发布文章。</p>
        ) : (
          <ul className="posts-list">
            {posts.map((post) => (
              <li key={post.id} className="post-item">
                <article>
                  <h2>
                    <Link href={`/posts/${post.slug}`}>{post.title}</Link>
                  </h2>
                  {post.excerpt ? <p>{post.excerpt}</p> : null}
                  <small>
                    作者：{post.author.email} · 发布于：
                    {(post.publishedAt ?? post.createdAt).toLocaleDateString("zh-CN")}
                  </small>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav aria-label="分页" className="pagination">
        <Link
          href={`/posts?page=${Math.max(1, page - 1)}`}
          aria-disabled={page <= 1}
          className={page <= 1 ? "disabled" : ""}
        >
          上一页
        </Link>
        <span>
          第 {page} / {totalPages} 页
        </span>
        <Link
          href={`/posts?page=${Math.min(totalPages, page + 1)}`}
          aria-disabled={page >= totalPages}
          className={page >= totalPages ? "disabled" : ""}
        >
          下一页
        </Link>
      </nav>
    </main>
  );
}
