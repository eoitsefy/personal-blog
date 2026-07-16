import { fail, logApi, ok } from "@/lib/api";
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
    const existing = await tx.post.findUnique({
      where: { id },
      select: {
        deletedAt: true,
        assets: { select: { assetId: true } },
      },
    });

    if (!existing) return "NOT_FOUND" as const;
    if (!existing.deletedAt) return "ACTIVE" as const;

    const deleted = await tx.post.deleteMany({
      where: { id, deletedAt: { not: null } },
    });
    if (deleted.count !== 1) return "ACTIVE" as const;

    const assetIds = existing.assets.map(({ assetId }) => assetId);
    if (assetIds.length > 0) {
      await tx.asset.updateMany({
        where: { id: { in: assetIds }, refCount: { gt: 0 } },
        data: { refCount: { decrement: 1 } },
      });
    }

    return "DELETED" as const;
  });

  if (outcome === "NOT_FOUND") return fail("NOT_FOUND", "文章不存在", 404, auth.requestId);
  if (outcome === "ACTIVE") {
    return fail("CONFLICT", "文章必须先移入回收站才能永久删除", 409, auth.requestId);
  }

  logApi({
    requestId: auth.requestId,
    path: `/api/admin/posts/${id}/purge`,
    method: "DELETE",
    status: 200,
    latencyMs: Date.now() - start,
    userId: auth.user.id,
  });
  return ok({ id, permanentlyDeleted: true }, auth.requestId);
}
