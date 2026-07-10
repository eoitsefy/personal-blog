import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ slug: string }>;
};

async function getPublishedPostBySlug(slug: string) {
  return prisma.post.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      contentMd: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      author: { select: { id: true } },
    },
  });
}

export const revalidate = 60;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);

  if (!post) return { title: "文章不存在", description: "你访问的文章不存在或未发布" };

  const description = post.excerpt ?? post.title;
  return {
    title: `${post.title} | EastherPhil Blog`,
    description,
    openGraph: {
      title: post.title,
      description,
      type: "article",
      publishedTime: post.publishedAt?.toISOString(),
      url: `https://eastherphil.cn/posts/${post.slug}`,
    },
  };
}

export default async function PostDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) notFound();

  const publishDate = post.publishedAt ?? post.createdAt;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 md:py-12">
      <article className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 md:p-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold leading-tight md:text-4xl">{post.title}</h1>
          <div className="mt-3 text-sm text-neutral-500">
            <time dateTime={publishDate.toISOString()}>
              {publishDate.toLocaleDateString("zh-CN")}
            </time>
          </div>
          {post.excerpt ? <p className="mt-4 text-base leading-7">{post.excerpt}</p> : null}
        </header>

        <section className="prose prose-neutral max-w-none dark:prose-invert" aria-label="文章正文">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.contentMd}</ReactMarkdown>
        </section>
      </article>
    </main>
  );
}
