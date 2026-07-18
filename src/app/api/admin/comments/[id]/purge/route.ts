import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { validateMutationOrigin } from "@/lib/request-security";
import { requireAdmin } from "@/lib/require-admin";

export async function DELETE(req: Request, context: RouteContext<"/api/admin/comments/[id]/purge">) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const originFailure = validateMutationOrigin(req);
  if (originFailure) return fail("FORBIDDEN", originFailure.message, originFailure.status, auth.requestId);
  const { id } = await context.params;
  const comment = await prisma.comment.findUnique({ where: { id }, select: { deletedAt: true } });
  if (!comment) return fail("NOT_FOUND", "评论不存在", 404, auth.requestId);
  if (!comment.deletedAt) return fail("CONFLICT", "只能永久删除回收站中的评论", 409, auth.requestId);
  await prisma.comment.delete({ where: { id } });
  return ok({ purged: true }, auth.requestId);
}
