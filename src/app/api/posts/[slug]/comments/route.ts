import { z } from "zod";
import { fail, getRequestId, ok } from "@/lib/api";
import {
  CommentContentSchema,
  commentRateLimitKey,
  consumeCommentRateLimit,
  hasDuplicateComment,
  listPublicComments,
} from "@/lib/comments";
import { getUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonMutation } from "@/lib/request-security";
import { requireVerifiedUser } from "@/lib/require-user";

const CreateCommentSchema = z.object({
  content: CommentContentSchema,
  parentId: z.string().cuid().nullable().optional(),
});

export async function GET(req: Request, context: RouteContext<"/api/posts/[slug]/comments">) {
  const requestId = getRequestId(req);
  const { slug } = await context.params;
  const user = await getUserFromRequest(req);
  const post = await prisma.post.findFirst({
    where: { slug, status: "PUBLISHED", deletedAt: null },
    select: { id: true, commentsLocked: true },
  });
  if (!post) return fail("NOT_FOUND", "文章不存在", 404, requestId);

  return ok({
    comments: await listPublicComments(post.id, user?.id ?? null),
    commentsLocked: post.commentsLocked,
    canComment: Boolean(user?.emailVerifiedAt) && !post.commentsLocked,
  }, requestId);
}

export async function POST(req: Request, context: RouteContext<"/api/posts/[slug]/comments">) {
  const auth = await requireVerifiedUser(req);
  if (!auth.ok) return auth.response;
  const body = await readJsonMutation(req, 8_192);
  if (!body.ok) return fail("BAD_REQUEST", body.failure.message, body.failure.status, auth.requestId);
  const parsed = CreateCommentSchema.safeParse(body.value);
  if (!parsed.success) {
    return fail("BAD_REQUEST", parsed.error.issues[0]?.message ?? "评论内容无效", 400, auth.requestId);
  }

  const { slug } = await context.params;
  const post = await prisma.post.findFirst({
    where: { slug, status: "PUBLISHED", deletedAt: null },
    select: { id: true, commentsLocked: true },
  });
  if (!post) return fail("NOT_FOUND", "文章不存在或已停止评论", 404, auth.requestId);
  if (post.commentsLocked) return fail("FORBIDDEN", "该文章的评论区已锁定", 403, auth.requestId);

  if (parsed.data.parentId) {
    const parent = await prisma.comment.findFirst({
      where: {
        id: parsed.data.parentId,
        postId: post.id,
        parentId: null,
        deletedAt: null,
        status: "PUBLISHED",
      },
      select: { id: true },
    });
    if (!parent) return fail("BAD_REQUEST", "只能回复已发布的一级评论", 400, auth.requestId);
  }

  const throttle = await consumeCommentRateLimit(commentRateLimitKey(req, auth.user.id));
  if (throttle.limited) {
    return fail("RATE_LIMITED", "评论过于频繁，请稍后再试", 429, auth.requestId, {
      "Retry-After": String(throttle.retryAfterSeconds),
    });
  }
  if (await hasDuplicateComment(auth.user.id, post.id, parsed.data.content)) {
    return fail("CONFLICT", "请勿重复提交相同评论", 409, auth.requestId);
  }

  const comment = await prisma.comment.create({
    data: {
      content: parsed.data.content,
      postId: post.id,
      authorId: auth.user.id,
      parentId: parsed.data.parentId ?? null,
      status: "PENDING",
    },
    select: { id: true, status: true, createdAt: true },
  });
  return ok({ comment: { ...comment, createdAt: comment.createdAt.toISOString() } }, auth.requestId, 201);
}
