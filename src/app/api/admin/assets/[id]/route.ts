import { fail, logApi, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { validateMutationOrigin } from "@/lib/request-security";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, { params }: RouteParams) {
  const start = Date.now();
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const originFailure = validateMutationOrigin(req);
  if (originFailure) return fail("FORBIDDEN", originFailure.message, originFailure.status, auth.requestId);

  const { id } = await params;
  const outcome = await prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findUnique({
      where: { id },
      select: { id: true, deletedAt: true, refCount: true },
    });
    if (!asset) return "NOT_FOUND" as const;
    if (asset.refCount > 0) return "REFERENCED" as const;
    if (!asset.deletedAt) {
      const deleted = await tx.asset.updateMany({
        where: { id, deletedAt: null, refCount: 0 },
        data: { deletedAt: new Date() },
      });
      if (deleted.count !== 1) return "CHANGED" as const;
    }
    return "DELETED" as const;
  });

  if (outcome === "NOT_FOUND") return fail("NOT_FOUND", "媒体文件不存在", 404, auth.requestId);
  if (outcome === "REFERENCED") return fail("CONFLICT", "媒体仍被文章引用，无法删除", 409, auth.requestId);
  if (outcome === "CHANGED") return fail("CONFLICT", "媒体状态已变化，请刷新后重试", 409, auth.requestId);

  logApi({
    requestId: auth.requestId,
    path: `/api/admin/assets/${id}`,
    method: "DELETE",
    status: 200,
    latencyMs: Date.now() - start,
    userId: auth.user.id,
  });
  return ok({ id, deleted: true }, auth.requestId);
}
