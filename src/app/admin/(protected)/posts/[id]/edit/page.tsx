import { notFound } from "next/navigation";
import { PostForm } from "@/components/admin/post-form";
import { requireAdminPage } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

type PageProps = { params: Promise<{ id: string }> };

export const metadata = { title: "编辑文章", robots: { index: false, follow: false } };

export default async function EditPostPage({ params }: PageProps) {
  await requireAdminPage();
  const { id } = await params;
  const [post, categories, tags] = await Promise.all([
    prisma.post.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        contentMd: true,
        status: true,
        category: { select: { name: true } },
        tags: { select: { tag: { select: { name: true } } } },
      },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
    prisma.tag.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  if (!post) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <p className="text-sm text-neutral-500">文章管理</p>
      <h1 className="mt-1 text-3xl font-bold">编辑文章</h1>
      <PostForm
        mode="edit"
        postId={post.id}
        initialValue={{
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt ?? "",
          contentMd: post.contentMd,
          status: post.status,
          category: post.category?.name ?? "",
          tags: post.tags.map(({ tag }) => tag.name),
        }}
        categoryOptions={categories.map(({ name }) => name)}
        tagOptions={tags.map(({ name }) => name)}
      />
    </main>
  );
}
