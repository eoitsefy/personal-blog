import Link from "next/link";
import { MediaManager } from "@/components/admin/media-manager";
import { requireAdminPage } from "@/lib/admin-auth";
import { ADMIN_ASSET_PAGE_SIZE, adminAssetListQuerySchema } from "@/lib/media/validators";
import { prisma } from "@/lib/prisma";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export const metadata = { title: "媒体管理", robots: { index: false, follow: false } };

type MediaQuery = { deleted: "active" | "trash"; page: number; q: string; kind: "ALL" | "IMAGE" | "AUDIO" };

function mediaHref(query: MediaQuery, page: number, deleted = query.deleted) {
  const params = new URLSearchParams();
  if (deleted === "trash") params.set("deleted", "trash");
  if (query.q) params.set("q", query.q);
  if (query.kind !== "ALL") params.set("kind", query.kind);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return `/admin/media${search ? `?${search}` : ""}`;
}

export default async function MediaPage({ searchParams }: PageProps) {
  await requireAdminPage();
  const raw = await searchParams;
  const parsed = adminAssetListQuerySchema.safeParse({
    page: Array.isArray(raw.page) ? raw.page[0] : raw.page,
    q: Array.isArray(raw.q) ? raw.q[0] : raw.q,
    kind: Array.isArray(raw.kind) ? raw.kind[0] : raw.kind,
    deleted: Array.isArray(raw.deleted) ? raw.deleted[0] : raw.deleted,
  });
  const query = parsed.success ? parsed.data : { page: 1, q: "", kind: "ALL" as const, deleted: "active" as const };
  const where = {
    deletedAt: query.deleted === "trash" ? { not: null } : null,
    kind: query.kind === "ALL" ? undefined : query.kind,
    originalName: query.q ? { contains: query.q, mode: "insensitive" as const } : undefined,
  };
  const [total, assets] = await Promise.all([
    prisma.asset.count({ where }),
    prisma.asset.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * ADMIN_ASSET_PAGE_SIZE,
      take: ADMIN_ASSET_PAGE_SIZE,
      select: { id: true, url: true, originalName: true, kind: true, mime: true, size: true, width: true, height: true, durationMs: true, refCount: true, deletedAt: true, createdAt: true },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_ASSET_PAGE_SIZE));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <p className="text-sm text-neutral-500">博客后台</p>
      <h1 className="mt-1 text-3xl font-bold">媒体管理</h1>
      <div className="mt-6 flex gap-4 border-b border-neutral-200 dark:border-neutral-800">
        <Link href={mediaHref(query, 1, "active")} className={`px-2 py-3 text-sm font-medium ${query.deleted === "active" ? "border-b-2 border-neutral-900 dark:border-white" : "text-neutral-500"}`}>媒体库</Link>
        <Link href={mediaHref(query, 1, "trash")} className={`px-2 py-3 text-sm font-medium ${query.deleted === "trash" ? "border-b-2 border-neutral-900 dark:border-white" : "text-neutral-500"}`}>回收站</Link>
      </div>

      <form method="get" className="mt-6 grid gap-3 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800 sm:grid-cols-[1fr_auto_auto]">
        {query.deleted === "trash" ? <input type="hidden" name="deleted" value="trash" /> : null}
        <label className="grid gap-1 text-sm">
          <span>文件名</span>
          <input name="q" defaultValue={query.q} maxLength={120} placeholder="搜索原始文件名" className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950" />
        </label>
        <label className="grid gap-1 text-sm">
          <span>类型</span>
          <select name="kind" defaultValue={query.kind} className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950">
            <option value="ALL">全部</option>
            <option value="IMAGE">图片</option>
            <option value="AUDIO">音频</option>
          </select>
        </label>
        <button type="submit" className="self-end rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">筛选</button>
      </form>

      <MediaManager assets={assets} deletedView={query.deleted === "trash"} />

      {totalPages > 1 ? (
        <nav className="mt-8 flex items-center justify-between" aria-label="媒体分页">
          {query.page > 1 ? <Link href={mediaHref(query, query.page - 1)} className="rounded-lg border px-4 py-2 text-sm">上一页</Link> : <span />}
          <span className="text-sm text-neutral-500">第 {query.page} / {totalPages} 页</span>
          {query.page < totalPages ? <Link href={mediaHref(query, query.page + 1)} className="rounded-lg border px-4 py-2 text-sm">下一页</Link> : <span />}
        </nav>
      ) : null}
    </main>
  );
}
