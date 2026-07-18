import { Prisma } from "@prisma/client";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { CommentReportReasonSchema } from "@/lib/comments";
import { prisma } from "@/lib/prisma";
import { readJsonMutation } from "@/lib/request-security";
import { requireVerifiedUser } from "@/lib/require-user";

const ReportSchema = z.object({ reason: CommentReportReasonSchema });

export async function POST(req: Request, context: RouteContext<"/api/comments/[id]/reports">) {
  const auth = await requireVerifiedUser(req);
  if (!auth.ok) return auth.response;
  const body = await readJsonMutation(req, 4_096);
  if (!body.ok) return fail("BAD_REQUEST", body.failure.message, body.failure.status, auth.requestId);
  const parsed = ReportSchema.safeParse(body.value);
  if (!parsed.success) return fail("BAD_REQUEST", parsed.error.issues[0]?.message ?? "举报原因无效", 400, auth.requestId);
  const { id } = await context.params;
  const comment = await prisma.comment.findFirst({
    where: { id, deletedAt: null, status: "PUBLISHED", post: { status: "PUBLISHED", deletedAt: null } },
    select: { authorId: true },
  });
  if (!comment) return fail("NOT_FOUND", "评论不存在", 404, auth.requestId);
  if (comment.authorId === auth.user.id) return fail("CONFLICT", "不能举报自己的评论", 409, auth.requestId);
  try {
    await prisma.commentReport.create({
      data: { commentId: id, reporterId: auth.user.id, reason: parsed.data.reason },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("CONFLICT", "你已经举报过这条评论", 409, auth.requestId);
    }
    throw error;
  }
  return ok({ reported: true }, auth.requestId, 201);
}
