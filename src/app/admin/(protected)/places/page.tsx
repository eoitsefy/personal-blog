import { Prisma } from "@prisma/client";
import Link from "next/link";
import { PlaceManager, type AdminPlace } from "@/components/admin/place-manager";
import { requireAdminPage } from "@/lib/admin-auth";
import { ADMIN_PLACE_PAGE_SIZE } from "@/lib/places";
import { prisma } from "@/lib/prisma";
import { adminPlaceListQuerySchema } from "@/lib/validators/place";

export const metadata = { title: "地点管理", robots: { index: false, follow: false } };
type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
function href(query: ReturnType<typeof adminPlaceListQuerySchema.parse>, changes: Partial<ReturnType<typeof adminPlaceListQuerySchema.parse>>) {
  const next = { ...query, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.privacy !== "ALL") params.set("privacy", next.privacy);
  if (next.deleted === "trash") params.set("deleted", "trash");
  if (next.page > 1) params.set("page", String(next.page));
  return params.size ? `/admin/places?${params}` : "/admin/places";
}

export default async function AdminPlacesPage({ searchParams }: PageProps) {
  await requireAdminPage();
  const sp = await searchParams;
  const parsed = adminPlaceListQuerySchema.safeParse({ page: first(sp.page), q: first(sp.q), privacy: first(sp.privacy), deleted: first(sp.deleted) });
  const query = parsed.success ? parsed.data : adminPlaceListQuerySchema.parse({});
  const where: Prisma.PlaceWhereInput = {
    deletedAt: query.deleted === "trash" ? { not: null } : null,
    ...(query.privacy !== "ALL" ? { privacy: query.privacy } : {}),
    ...(query.q ? { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { slug: { contains: query.q, mode: "insensitive" } }, { locationLabel: { contains: query.q, mode: "insensitive" } }] } : {}),
  };
  const [total, images] = await Promise.all([
    prisma.place.count({ where }),
    prisma.asset.findMany({ where: { kind: "IMAGE", isPublic: true, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, url: true, originalName: true } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PLACE_PAGE_SIZE));
  const currentQuery = { ...query, page: Math.min(query.page, totalPages) };
  const places = await prisma.place.findMany({ where, orderBy: [{ occurredAt: "desc" }, { updatedAt: "desc" }], skip: (currentQuery.page - 1) * ADMIN_PLACE_PAGE_SIZE, take: ADMIN_PLACE_PAGE_SIZE, include: { _count: { select: { posts: true } } } });
  const records: AdminPlace[] = places.map((place) => ({
    id: place.id, slug: place.slug, name: place.name, summary: place.summary, locationLabel: place.locationLabel,
    latitude: Number(place.latitude), longitude: Number(place.longitude), publicLatitude: place.publicLatitude === null ? null : Number(place.publicLatitude), publicLongitude: place.publicLongitude === null ? null : Number(place.publicLongitude),
    privacy: place.privacy, coordinateSystem: place.coordinateSystem, coordinateSource: place.coordinateSource,
    occurredAt: place.occurredAt?.toISOString() ?? null, coverAssetId: place.coverAssetId,
    deletedAt: place.deletedAt?.toISOString() ?? null, postCount: place._count.posts,
  }));
  return <main className="mx-auto w-full max-w-6xl px-4 py-10">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-neutral-500">共 {total} 个地点</p><h1 className="mt-1 text-3xl font-bold">地点管理</h1></div><Link href={query.deleted === "trash" ? "/admin/places" : "/admin/places?deleted=trash"} className="rounded-xl border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700">{query.deleted === "trash" ? "返回当前地点" : "查看回收站"}</Link></div>
    <form method="get" action="/admin/places" className="mt-6 flex flex-wrap items-end gap-3"><input type="search" name="q" defaultValue={query.q} placeholder="名称、slug 或地区" className="min-w-64 flex-1 rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700" /><select name="privacy" defaultValue={query.privacy} className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700"><option value="ALL">全部隐私级别</option><option value="EXACT">精确</option><option value="APPROXIMATE">模糊</option><option value="CITY_ONLY">仅城市</option><option value="HIDDEN">隐藏</option></select>{query.deleted === "trash" ? <input type="hidden" name="deleted" value="trash" /> : null}<button className="rounded-lg bg-neutral-900 px-4 py-2 text-white dark:bg-white dark:text-neutral-900">筛选</button></form>
    {records.length === 0 && currentQuery.deleted === "trash" ? <p className="mt-8 rounded-xl border border-dashed p-8 text-center text-neutral-500">地点回收站为空。</p> : <PlaceManager places={records} imageOptions={images} showForm={currentQuery.deleted === "active"} />}
    <nav className="mt-8 flex items-center justify-between" aria-label="后台地点分页"><span>{currentQuery.page <= 1 ? "上一页" : <Link href={href(currentQuery, { page: currentQuery.page - 1 })}>上一页</Link>}</span><span className="text-sm text-neutral-500">第 {currentQuery.page} / {totalPages} 页</span><span>{currentQuery.page >= totalPages ? "下一页" : <Link href={href(currentQuery, { page: currentQuery.page + 1 })}>下一页</Link>}</span></nav>
  </main>;
}
