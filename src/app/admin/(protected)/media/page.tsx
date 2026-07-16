import Link from "next/link";
import { MediaManager } from "@/components/admin/media-manager";
import { requireAdminPage } from "@/lib/admin-auth";
import { ADMIN_ASSET_PAGE_SIZE, adminAssetListQuerySchema } from "@/lib/media/validators";
import { prisma } from "@/lib/prisma";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export const metadata = { title: "媒体管理", robots: { index: false, follow: false } };

function mediaHref(deleted: "active" | "trash", page: number) {
  const params = new URLSearchParams();
  if (deleted === "trash") params.set("deleted", "trash");
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/admin/media${query ? `?${query}` : ""}`;
}

export default async function MediaPage({ searchParams }: PageProps) {
  await requireAdminPage();
  const raw = await searchParams;
  const parsed = adminAssetListQuerySchema.safeParse({
    page: Array.isArray(raw.page) ? raw.page[0] : raw.page,
    deleted: Array.isArray(raw.deleted) ? raw.deleted[0] : raw.deleted,
  });
  const query = parsed.success ? parsed.data : { page: 1, deleted: "active" as const };
  const where = { deletedAt: query.deleted === "trash" ? { not: null } : null };
  const [total, assets] = await Promise.all([
    prisma.asset.count({ where }),
    prisma.asset.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * ADMIN_ASSET_PAGE_SIZE,
      take: ADMIN_ASSET_PAGE_SIZE,
      select: { id: true, url: true, originalName: true, mime: true, size: true, width: true, height: true, refCount: true, deletedAt: true, createdAt: true },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_ASSET_PAGE_SIZE));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <p className="text-sm text-neutral-500">博客后台</p>
      <h1 className="mt-1 text-3xl font-bold">媒体管理</h1>
      <div className="mt-6 flex gap-4 border-b border-neutral-200 dark:border-neutral-800">
        <Link href={mediaHref("active", 1)} className={`px-2 py-3 text-sm font-medium ${query.deleted === "active" ? "border-b-2 border-neutral-900 dark:border-white" : "text-neutral-500"}`}>媒体库</Link>
        <Link href={mediaHref("trash", 1)} className={`px-2 py-3 text-sm font-medium ${query.deleted === "trash" ? "border-b-2 border-neutral-900 dark:border-white" : "text-neutral-500"}`}>回收站</Link>
      </div>

      <MediaManager assets={assets} deletedView={query.deleted === "trash"} />

      {totalPages > 1 ? (
        <nav className="mt-8 flex items-center justify-between" aria-label="媒体分页">
          {query.page > 1 ? <Link href={mediaHref(query.deleted, query.page - 1)} className="rounded-lg border px-4 py-2 text-sm">上一页</Link> : <span />}
          <span className="text-sm text-neutral-500">第 {query.page} / {totalPages} 页</span>
          {query.page < totalPages ? <Link href={mediaHref(query.deleted, query.page + 1)} className="rounded-lg border px-4 py-2 text-sm">下一页</Link> : <span />}
        </nav>
      ) : null}
    </main>
  );
}
