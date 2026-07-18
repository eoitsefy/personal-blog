import { fail, logApi, ok } from "@/lib/api";
import { replacePlaceCover } from "@/lib/places";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { validateMutationOrigin } from "@/lib/request-security";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, { params }: RouteParams) {
  const start = Date.now();
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const guardFailure = validateMutationOrigin(req);
  if (guardFailure) return fail("FORBIDDEN", guardFailure.message, guardFailure.status, auth.requestId);
  const { id } = await params;
  const outcome = await prisma.$transaction(async (tx) => {
    const existing = await tx.place.findUnique({ where: { id }, select: { deletedAt: true, coverAssetId: true, _count: { select: { posts: true } } } });
    if (!existing) return "NOT_FOUND" as const;
    if (!existing.deletedAt) return "ACTIVE" as const;
    if (existing._count.posts > 0) return "REFERENCED" as const;
    await replacePlaceCover(tx, existing.coverAssetId, null);
    await tx.place.delete({ where: { id } });
    return "DELETED" as const;
  });
  if (outcome === "NOT_FOUND") return fail("NOT_FOUND", "地点不存在", 404, auth.requestId);
  if (outcome === "ACTIVE") return fail("CONFLICT", "地点必须先移入回收站才能永久删除", 409, auth.requestId);
  if (outcome === "REFERENCED") return fail("CONFLICT", "地点仍被文章关联，请先从文章中移除", 409, auth.requestId);
  logApi({ requestId: auth.requestId, path: `/api/admin/places/${id}/purge`, method: "DELETE", status: 200, latencyMs: Date.now() - start, userId: auth.user.id });
  return ok({ id, permanentlyDeleted: true }, auth.requestId);
}
