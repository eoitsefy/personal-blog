import { fail, logApi, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { validateMutationOrigin } from "@/lib/request-security";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const start = Date.now();
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const guardFailure = validateMutationOrigin(req);
  if (guardFailure) return fail("FORBIDDEN", guardFailure.message, guardFailure.status, auth.requestId);

  const { id } = await params;
  const existing = await prisma.post.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
  if (!existing) return fail("NOT_FOUND", "文章不存在", 404, auth.requestId);

  if (existing.deletedAt) {
    await prisma.post.update({ where: { id }, data: { deletedAt: null } });
  }

  logApi({
    requestId: auth.requestId,
    path: `/api/admin/posts/${id}/restore`,
    method: "POST",
    status: 200,
    latencyMs: Date.now() - start,
    userId: auth.user.id,
  });
  return ok({ id, restored: true }, auth.requestId);
}
