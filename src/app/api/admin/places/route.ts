import { Prisma } from "@prisma/client";
import { fail, logApi, ok } from "@/lib/api";
import { ADMIN_PLACE_PAGE_SIZE, InvalidPlaceCoverError, replacePlaceCover } from "@/lib/places";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { readJsonMutation } from "@/lib/request-security";
import { adminPlaceListQuerySchema, CreatePlaceInputSchema } from "@/lib/validators/place";

const adminPlaceSelect = {
  id: true,
  slug: true,
  name: true,
  summary: true,
  locationLabel: true,
  latitude: true,
  longitude: true,
  publicLatitude: true,
  publicLongitude: true,
  privacy: true,
  coordinateSystem: true,
  coordinateSource: true,
  occurredAt: true,
  coverAssetId: true,
  coverAsset: { select: { url: true, originalName: true } },
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { posts: true } },
} satisfies Prisma.PlaceSelect;

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const parsed = adminPlaceListQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return fail("BAD_REQUEST", "查询参数无效", 400, auth.requestId);
  const query = parsed.data;
  const where: Prisma.PlaceWhereInput = {
    deletedAt: query.deleted === "trash" ? { not: null } : null,
    ...(query.privacy !== "ALL" ? { privacy: query.privacy } : {}),
    ...(query.q ? { OR: [
      { name: { contains: query.q, mode: "insensitive" } },
      { slug: { contains: query.q, mode: "insensitive" } },
      { locationLabel: { contains: query.q, mode: "insensitive" } },
    ] } : {}),
  };
  const [total, places] = await Promise.all([
    prisma.place.count({ where }),
    prisma.place.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { updatedAt: "desc" }],
      skip: (query.page - 1) * ADMIN_PLACE_PAGE_SIZE,
      take: ADMIN_PLACE_PAGE_SIZE,
      select: adminPlaceSelect,
    }),
  ]);
  return ok({ places, pagination: { page: query.page, pageSize: ADMIN_PLACE_PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / ADMIN_PLACE_PAGE_SIZE)) } }, auth.requestId);
}

export async function POST(req: Request) {
  const start = Date.now();
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonMutation(req);
    if (!body.ok) return fail("BAD_REQUEST", body.failure.message, body.failure.status, auth.requestId);
    const parsed = CreatePlaceInputSchema.safeParse(body.value);
    if (!parsed.success) return fail("BAD_REQUEST", parsed.error.issues[0]?.message ?? "地点内容不符合要求", 400, auth.requestId);
    const input = parsed.data;
    const coverAssetId = input.coverAssetId || null;
    const place = await prisma.$transaction(async (tx) => {
      await replacePlaceCover(tx, null, coverAssetId);
      return tx.place.create({
        data: {
          name: input.name,
          slug: input.slug,
          summary: input.summary || null,
          locationLabel: input.locationLabel,
          latitude: input.latitude,
          longitude: input.longitude,
          publicLatitude: input.privacy === "APPROXIMATE" ? input.publicLatitude || null : null,
          publicLongitude: input.privacy === "APPROXIMATE" ? input.publicLongitude || null : null,
          privacy: input.privacy,
          coordinateSystem: input.coordinateSystem,
          coordinateSource: input.coordinateSource,
          occurredAt: input.occurredAt ? new Date(input.occurredAt) : null,
          coverAssetId,
        },
        select: adminPlaceSelect,
      });
    });
    logApi({ requestId: auth.requestId, path: "/api/admin/places", method: "POST", status: 201, latencyMs: Date.now() - start, userId: auth.user.id });
    return ok({ place }, auth.requestId, 201);
  } catch (error) {
    if (error instanceof InvalidPlaceCoverError) return fail("BAD_REQUEST", error.message, 400, auth.requestId);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return fail("CONFLICT", "地点 slug 已存在", 409, auth.requestId);
    console.error("[POST /api/admin/places] failed", error);
    return fail("INTERNAL_ERROR", "地点创建失败", 500, auth.requestId);
  }
}
