import { Prisma } from "@prisma/client";
import { fail, logApi, ok } from "@/lib/api";
import { InvalidPlaceCoverError, replacePlaceCover } from "@/lib/places";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { readJsonMutation, validateMutationOrigin } from "@/lib/request-security";
import { CreatePlaceInputSchema, UpdatePlaceInputSchema } from "@/lib/validators/place";

type RouteParams = { params: Promise<{ id: string }> };

const detailSelect = {
  id: true, slug: true, name: true, summary: true, locationLabel: true,
  latitude: true, longitude: true, publicLatitude: true, publicLongitude: true,
  privacy: true, coordinateSystem: true, coordinateSource: true, occurredAt: true,
  coverAssetId: true, coverAsset: { select: { url: true, originalName: true } },
  deletedAt: true, createdAt: true, updatedAt: true,
  posts: { select: { post: { select: { id: true, title: true, slug: true, status: true, deletedAt: true } } } },
} satisfies Prisma.PlaceSelect;

export async function GET(req: Request, { params }: RouteParams) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const place = await prisma.place.findUnique({ where: { id }, select: detailSelect });
  if (!place) return fail("NOT_FOUND", "地点不存在", 404, auth.requestId);
  return ok({ place }, auth.requestId);
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const start = Date.now();
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  try {
    const body = await readJsonMutation(req);
    if (!body.ok) return fail("BAD_REQUEST", body.failure.message, body.failure.status, auth.requestId);
    const partial = UpdatePlaceInputSchema.safeParse(body.value);
    if (!partial.success) return fail("BAD_REQUEST", partial.error.issues[0]?.message ?? "地点内容不符合要求", 400, auth.requestId);
    const existing = await prisma.place.findUnique({ where: { id } });
    if (!existing) return fail("NOT_FOUND", "地点不存在", 404, auth.requestId);
    if (existing.deletedAt) return fail("CONFLICT", "请先从回收站恢复地点", 409, auth.requestId);

    const merged = CreatePlaceInputSchema.safeParse({
      name: existing.name,
      slug: existing.slug,
      summary: existing.summary ?? "",
      locationLabel: existing.locationLabel,
      latitude: Number(existing.latitude),
      longitude: Number(existing.longitude),
      publicLatitude: existing.publicLatitude === null ? null : Number(existing.publicLatitude),
      publicLongitude: existing.publicLongitude === null ? null : Number(existing.publicLongitude),
      privacy: existing.privacy,
      coordinateSystem: existing.coordinateSystem,
      coordinateSource: existing.coordinateSource,
      occurredAt: existing.occurredAt?.toISOString() ?? "",
      coverAssetId: existing.coverAssetId ?? "",
      ...partial.data,
    });
    if (!merged.success) return fail("BAD_REQUEST", merged.error.issues[0]?.message ?? "地点内容不符合要求", 400, auth.requestId);
    const input = merged.data;
    const coverAssetId = input.coverAssetId || null;
    const place = await prisma.$transaction(async (tx) => {
      await replacePlaceCover(tx, existing.coverAssetId, coverAssetId);
      return tx.place.update({
        where: { id },
        data: {
          name: input.name, slug: input.slug, summary: input.summary || null,
          locationLabel: input.locationLabel, latitude: input.latitude, longitude: input.longitude,
          publicLatitude: input.privacy === "APPROXIMATE" ? input.publicLatitude || null : null,
          publicLongitude: input.privacy === "APPROXIMATE" ? input.publicLongitude || null : null,
          privacy: input.privacy, coordinateSystem: input.coordinateSystem,
          coordinateSource: input.coordinateSource,
          occurredAt: input.occurredAt ? new Date(input.occurredAt) : null,
          coverAssetId,
        },
        select: detailSelect,
      });
    });
    logApi({ requestId: auth.requestId, path: `/api/admin/places/${id}`, method: "PATCH", status: 200, latencyMs: Date.now() - start, userId: auth.user.id });
    return ok({ place }, auth.requestId);
  } catch (error) {
    if (error instanceof InvalidPlaceCoverError) return fail("BAD_REQUEST", error.message, 400, auth.requestId);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return fail("CONFLICT", "地点 slug 已存在", 409, auth.requestId);
    console.error(`[PATCH /api/admin/places/${id}] failed`, error);
    return fail("INTERNAL_ERROR", "地点更新失败", 500, auth.requestId);
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const start = Date.now();
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const guardFailure = validateMutationOrigin(req);
  if (guardFailure) return fail("FORBIDDEN", guardFailure.message, guardFailure.status, auth.requestId);
  const { id } = await params;
  const existing = await prisma.place.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
  if (!existing) return fail("NOT_FOUND", "地点不存在", 404, auth.requestId);
  if (!existing.deletedAt) await prisma.place.update({ where: { id }, data: { deletedAt: new Date() } });
  logApi({ requestId: auth.requestId, path: `/api/admin/places/${id}`, method: "DELETE", status: 200, latencyMs: Date.now() - start, userId: auth.user.id });
  return ok({ id, deleted: true }, auth.requestId);
}
