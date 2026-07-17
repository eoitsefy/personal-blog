import Link from "next/link";
import { notFound } from "next/navigation";
import { RichMarkdown } from "@/components/content/rich-markdown";
import { requireAdminPage } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

type PageProps = { params: Promise<{ id: string }> };

export const metadata = { title: "文章预览", robots: { index: false, follow: false } };

export default async function PreviewPostPage({ params }: PageProps) {
  await requireAdminPage();
  const { id } = await params;
  const post = await prisma.post.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      contentMd: true,
      status: true,
      updatedAt: true,
      assets: { select: { asset: { select: { url: true, kind: true, originalName: true, mime: true } } } },
    },
  });
  if (!post) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-amber-50 px-5 py-4 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        <p className="text-sm">后台预览 · {post.status === "PUBLISHED" ? "当前已发布" : "当前为草稿"}</p>
        <Link href={`/admin/posts/${post.id}/edit`} className="text-sm font-medium underline">返回编辑</Link>
      </div>
      <article className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 md:p-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold md:text-5xl">{post.title}</h1>
          {post.excerpt ? <p className="mt-4 text-lg text-neutral-600 dark:text-neutral-300">{post.excerpt}</p> : null}
          <p className="mt-4 text-sm text-neutral-500">最后更新：{post.updatedAt.toLocaleString("zh-CN")}</p>
        </header>
        <section className="prose prose-neutral max-w-none dark:prose-invert" aria-label="文章预览正文">
          <RichMarkdown markdown={post.contentMd} assets={post.assets.map(({ asset }) => asset)} />
        </section>
      </article>
    </main>
  );
}
