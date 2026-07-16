import { PostForm } from "@/components/admin/post-form";
import { requireAdminPage } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "新建文章", robots: { index: false, follow: false } };

export default async function NewPostPage() {
  await requireAdminPage();
  const [categories, tags, media] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
    prisma.tag.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
    prisma.asset.findMany({
      where: { deletedAt: null, isPublic: true },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: { id: true, url: true, originalName: true, mime: true, size: true, width: true, height: true, refCount: true, deletedAt: true, createdAt: true },
    }),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <p className="text-sm text-neutral-500">文章管理</p>
      <h1 className="mt-1 text-3xl font-bold">新建文章</h1>
      <PostForm
        mode="create"
        categoryOptions={categories.map(({ name }) => name)}
        tagOptions={tags.map(({ name }) => name)}
        mediaOptions={media}
      />
    </main>
  );
}
