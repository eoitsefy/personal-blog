import { fail, logApi, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { validateMutationOrigin } from "@/lib/request-security";
import { getLocalStorage } from "@/lib/storage/local";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const start = Date.now();
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const originFailure = validateMutationOrigin(req);
  if (originFailure) return fail("FORBIDDEN", originFailure.message, originFailure.status, auth.requestId);

  const { id } = await params;
  const asset = await prisma.asset.findUnique({ where: { id }, select: { id: true, ossKey: true, deletedAt: true } });
  if (!asset) return fail("NOT_FOUND", "媒体文件不存在", 404, auth.requestId);

  try {
    await getLocalStorage().read(asset.ossKey);
  } catch {
    return fail("CONFLICT", "存储文件已丢失，无法恢复", 409, auth.requestId);
  }

  if (asset.deletedAt) {
    const restored = await prisma.asset.updateMany({
      where: { id, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    if (restored.count !== 1) return fail("CONFLICT", "媒体状态已变化，请刷新后重试", 409, auth.requestId);
  }
  logApi({
    requestId: auth.requestId,
    path: `/api/admin/assets/${id}/restore`,
    method: "POST",
    status: 200,
    latencyMs: Date.now() - start,
    userId: auth.user.id,
  });
  return ok({ id, restored: true }, auth.requestId);
}
