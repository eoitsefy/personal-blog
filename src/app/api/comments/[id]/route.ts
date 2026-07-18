import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { CommentContentSchema } from "@/lib/comments";
import { prisma } from "@/lib/prisma";
import { readJsonMutation, validateMutationOrigin } from "@/lib/request-security";
import { requireVerifiedUser } from "@/lib/require-user";

const UpdateSchema = z.object({ content: CommentContentSchema });

export async function PATCH(req: Request, context: RouteContext<"/api/comments/[id]">) {
  const auth = await requireVerifiedUser(req);
  if (!auth.ok) return auth.response;
  const body = await readJsonMutation(req, 8_192);
  if (!body.ok) return fail("BAD_REQUEST", body.failure.message, body.failure.status, auth.requestId);
  const parsed = UpdateSchema.safeParse(body.value);
  if (!parsed.success) return fail("BAD_REQUEST", parsed.error.issues[0]?.message ?? "评论内容无效", 400, auth.requestId);
  const { id } = await context.params;
  const existing = await prisma.comment.findFirst({
    where: { id, authorId: auth.user.id, deletedAt: null },
    select: { id: true, post: { select: { status: true, deletedAt: true, commentsLocked: true } } },
  });
  if (!existing) return fail("NOT_FOUND", "评论不存在或无权编辑", 404, auth.requestId);
  if (existing.post.status !== "PUBLISHED" || existing.post.deletedAt || existing.post.commentsLocked) {
    return fail("FORBIDDEN", "该文章当前不允许编辑评论", 403, auth.requestId);
  }
  const now = new Date();
  const comment = await prisma.comment.update({
    where: { id },
    data: { content: parsed.data.content, status: "PENDING", editedAt: now },
    select: { id: true, status: true, editedAt: true },
  });
  await prisma.commentReport.updateMany({ where: { commentId: id, status: "OPEN" }, data: { status: "RESOLVED" } });
  return ok({ comment: { ...comment, editedAt: comment.editedAt?.toISOString() ?? null } }, auth.requestId);
}

export async function DELETE(req: Request, context: RouteContext<"/api/comments/[id]">) {
  const auth = await requireVerifiedUser(req);
  if (!auth.ok) return auth.response;
  const originFailure = validateMutationOrigin(req);
  if (originFailure) return fail("FORBIDDEN", originFailure.message, originFailure.status, auth.requestId);
  const { id } = await context.params;
  const updated = await prisma.comment.updateMany({
    where: { id, authorId: auth.user.id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (updated.count !== 1) return fail("NOT_FOUND", "评论不存在或无权删除", 404, auth.requestId);
  return ok({ deleted: true }, auth.requestId);
}
