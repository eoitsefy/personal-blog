import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { readJsonMutation, validateMutationOrigin } from "@/lib/request-security";
import { requireAdmin } from "@/lib/require-admin";

const ActionSchema = z.object({ action: z.enum(["PUBLISH", "HIDE", "SPAM", "RESTORE"]) });

export async function PATCH(req: Request, context: RouteContext<"/api/admin/comments/[id]">) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const body = await readJsonMutation(req, 4_096);
  if (!body.ok) return fail("BAD_REQUEST", body.failure.message, body.failure.status, auth.requestId);
  const parsed = ActionSchema.safeParse(body.value);
  if (!parsed.success) return fail("BAD_REQUEST", "评论操作无效", 400, auth.requestId);
  const { id } = await context.params;
  const existing = await prisma.comment.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
  if (!existing) return fail("NOT_FOUND", "评论不存在", 404, auth.requestId);

  if (parsed.data.action !== "RESTORE" && existing.deletedAt) {
    return fail("CONFLICT", "请先从回收站恢复评论", 409, auth.requestId);
  }
  const status = parsed.data.action === "PUBLISH"
    ? "PUBLISHED"
    : parsed.data.action === "SPAM"
      ? "SPAM"
      : parsed.data.action === "HIDE"
        ? "HIDDEN"
        : "PENDING";
  const comment = await prisma.$transaction(async (tx) => {
    const updated = await tx.comment.update({
      where: { id },
      data: parsed.data.action === "RESTORE" ? { deletedAt: null, status } : { status },
      select: { id: true, status: true, deletedAt: true },
    });
    await tx.commentReport.updateMany({
      where: { commentId: id, status: "OPEN" },
      data: { status: status === "SPAM" || status === "HIDDEN" ? "RESOLVED" : "DISMISSED" },
    });
    return updated;
  });
  return ok({ comment }, auth.requestId);
}

export async function DELETE(req: Request, context: RouteContext<"/api/admin/comments/[id]">) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const originFailure = validateMutationOrigin(req);
  if (originFailure) return fail("FORBIDDEN", originFailure.message, originFailure.status, auth.requestId);
  const { id } = await context.params;
  const result = await prisma.comment.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (result.count !== 1) return fail("NOT_FOUND", "评论不存在或已删除", 404, auth.requestId);
  return ok({ deleted: true }, auth.requestId);
}
