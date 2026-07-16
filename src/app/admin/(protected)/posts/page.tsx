import { Prisma } from "@prisma/client";
import Link from "next/link";
import { PostActions } from "@/components/admin/post-actions";
import { requireAdminPage } from "@/lib/admin-auth";
import { ADMIN_POST_PAGE_SIZE } from "@/lib/post-query";
import { prisma } from "@/lib/prisma";
import { adminPostListQuerySchema, type AdminPostListQuery } from "@/lib/validators/post";

export const metadata = { title: "文章管理", robots: { index: false, follow: false } };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function adminHref(query: AdminPostListQuery, changes: Partial<AdminPostListQuery>) {
  const next = { ...query, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.status !== "ALL") params.set("status", next.status);
  if (next.deleted === "trash") params.set("deleted", "trash");
  if (next.page > 1) params.set("page", String(next.page));
  const search = params.toString();
  return search ? `/admin/posts?${search}` : "/admin/posts";
}

export default async function AdminPostsPage({ searchParams }: PageProps) {
  await requireAdminPage();
  const sp = await searchParams;
  const parsed = adminPostListQuerySchema.safeParse({
    page: first(sp.page),
    q: first(sp.q),
    status: first(sp.status),
    deleted: first(sp.deleted),
  });
  const initialQuery = parsed.success ? parsed.data : adminPostListQuerySchema.parse({});
  const where: Prisma.PostWhereInput = {
    deletedAt: initialQuery.deleted === "trash" ? { not: null } : null,
    ...(initialQuery.status !== "ALL" ? { status: initialQuery.status } : {}),
    ...(initialQuery.q
      ? {
          OR: [
            { title: { contains: initialQuery.q, mode: "insensitive" } },
            { slug: { contains: initialQuery.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const total = await prisma.post.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_POST_PAGE_SIZE));
  const query = { ...initialQuery, page: Math.min(initialQuery.page, totalPages) };
  const posts = await prisma.post.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    skip: (query.page - 1) * ADMIN_POST_PAGE_SIZE,
    take: ADMIN_POST_PAGE_SIZE,
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      status: true,
      publishedAt: true,
      deletedAt: true,
      updatedAt: true,
      category: { select: { name: true } },
      tags: { select: { tag: { select: { name: true } } } },
    },
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-neutral-500">共 {total} 篇文章</p>
          <h1 className="mt-1 text-3xl font-bold">文章管理</h1>
        </div>
        <Link href="/admin/posts/new" className="rounded-xl bg-neutral-900 px-5 py-3 font-medium text-white dark:bg-white dark:text-neutral-900">
          新建文章
        </Link>
      </div>

      <div className="mt-6 flex gap-2 border-b border-neutral-200 dark:border-neutral-800">
        <Link href={adminHref(query, { deleted: "active", page: 1 })} className={`px-4 py-2 text-sm font-medium ${query.deleted === "active" ? "border-b-2 border-neutral-900 dark:border-white" : "text-neutral-500"}`}>
          当前文章
        </Link>
        <Link href={adminHref(query, { deleted: "trash", page: 1, status: "ALL" })} className={`px-4 py-2 text-sm font-medium ${query.deleted === "trash" ? "border-b-2 border-neutral-900 dark:border-white" : "text-neutral-500"}`}>
          回收站
        </Link>
      </div>

      <form action="/admin/posts" method="get" className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
        {query.deleted === "trash" ? <input type="hidden" name="deleted" value="trash" /> : null}
        <label className="grid min-w-64 flex-1 gap-1 text-sm">
          <span>搜索</span>
          <input name="q" type="search" defaultValue={query.q} maxLength={80} placeholder="标题或 slug" className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700" />
        </label>
        {query.deleted === "active" ? (
          <label className="grid gap-1 text-sm">
            <span>状态</span>
            <select name="status" defaultValue={query.status} className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700">
              <option value="ALL">全部</option>
              <option value="DRAFT">草稿</option>
              <option value="PUBLISHED">已发布</option>
            </select>
          </label>
        ) : null}
        <button type="submit" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">筛选</button>
        <Link href={query.deleted === "trash" ? "/admin/posts?deleted=trash" : "/admin/posts"} className="px-2 py-2 text-sm">清除</Link>
      </form>

      {posts.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-dashed border-neutral-300 p-10 text-center dark:border-neutral-700">
          <p className="text-neutral-600 dark:text-neutral-300">{query.deleted === "trash" ? "回收站为空。" : "没有符合条件的文章。"}</p>
        </section>
      ) : (
        <ul className="mt-8 grid gap-4">
          {posts.map((post) => (
            <li key={post.id} className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold">{post.title}</h2>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${post.deletedAt ? "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200" : post.status === "PUBLISHED" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"}`}>
                      {post.deletedAt ? "已删除" : post.status === "PUBLISHED" ? "已发布" : "草稿"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-neutral-500">/{post.slug} · 更新于 {post.updatedAt.toLocaleString("zh-CN")}</p>
                  {post.category || post.tags.length ? (
                    <p className="mt-2 text-sm text-neutral-500">
                      {[post.category?.name, ...post.tags.map(({ tag }) => `#${tag.name}`)].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                  {post.excerpt ? <p className="mt-3 max-w-3xl text-sm text-neutral-600 dark:text-neutral-300">{post.excerpt}</p> : null}
                </div>
                {!post.deletedAt ? (
                  <div className="flex flex-wrap gap-3 text-sm">
                    <Link href={`/admin/posts/${post.id}/edit`} className="font-medium underline-offset-4 hover:underline">编辑</Link>
                    <Link href={`/admin/posts/${post.id}/preview`} className="font-medium underline-offset-4 hover:underline">预览</Link>
                    {post.status === "PUBLISHED" ? <Link href={`/posts/${post.slug}`} className="font-medium underline-offset-4 hover:underline">公开页</Link> : null}
                  </div>
                ) : null}
              </div>
              <div className="mt-4 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                <PostActions id={post.id} title={post.title} status={post.status} deleted={Boolean(post.deletedAt)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <nav className="mt-8 flex items-center justify-between" aria-label="后台文章分页">
        {query.page <= 1 ? <span className="text-neutral-400">上一页</span> : <Link href={adminHref(query, { page: query.page - 1 })}>上一页</Link>}
        <span className="text-sm text-neutral-500">第 {query.page} / {totalPages} 页</span>
        {query.page >= totalPages ? <span className="text-neutral-400">下一页</span> : <Link href={adminHref(query, { page: query.page + 1 })}>下一页</Link>}
      </nav>
    </main>
  );
}
