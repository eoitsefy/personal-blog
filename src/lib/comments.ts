import { createHash } from "node:crypto";
import type { CommentStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientAddress } from "@/lib/request-security";

const URL_PATTERN = /(?:https?:\/\/|www\.)/gi;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const ACTIVE_CONTENT_PATTERN = /<\s*\/?\s*(?:script|iframe|object|embed)|javascript\s*:/iu;
const EXCESSIVE_REPEAT_PATTERN = /(.)\1{19,}/u;
const COMMENT_WINDOW_MS = 10 * 60 * 1000;
const COMMENT_BLOCK_MS = 30 * 60 * 1000;
const MAX_COMMENTS_PER_WINDOW = 5;

export const CommentContentSchema = z.string()
  .transform((value) => value.replace(/\r\n?/g, "\n").trim())
  .pipe(z.string().min(2, "评论至少需要 2 个字符").max(1000, "评论不能超过 1000 个字符"))
  .superRefine((value, context) => {
    if (CONTROL_CHARACTER_PATTERN.test(value)) {
      context.addIssue({ code: "custom", message: "评论包含无效控制字符" });
    }
    if (ACTIVE_CONTENT_PATTERN.test(value)) {
      context.addIssue({ code: "custom", message: "评论不能包含脚本或嵌入内容" });
    }
    if ((value.match(URL_PATTERN) ?? []).length > 2) {
      context.addIssue({ code: "custom", message: "每条评论最多包含 2 个链接" });
    }
    if (EXCESSIVE_REPEAT_PATTERN.test(value)) {
      context.addIssue({ code: "custom", message: "评论包含过多重复字符" });
    }
  });

export const CommentReportReasonSchema = z.string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(2, "请说明举报原因").max(200, "举报原因不能超过 200 个字符"));

export function commentAuthorLabel(user: { id: string; role: "USER" | "ADMIN" }) {
  return user.role === "ADMIN" ? "博主" : `读者·${user.id.slice(-4).toUpperCase()}`;
}

export function commentRateLimitKey(req: Request, userId: string) {
  const address = getClientAddress(req);
  return createHash("sha256").update(`${address}|${userId}`).digest("hex");
}

export async function consumeCommentRateLimit(key: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.commentRateLimit.findUnique({ where: { key } });
    if (current?.blockedUntil && current.blockedUntil > now) {
      return {
        limited: true as const,
        retryAfterSeconds: Math.max(1, Math.ceil((current.blockedUntil.getTime() - now.getTime()) / 1000)),
      };
    }

    const windowExpired = !current || current.windowStartedAt.getTime() <= now.getTime() - COMMENT_WINDOW_MS;
    const attempts = windowExpired ? 1 : current.attempts + 1;
    const blockedUntil = attempts > MAX_COMMENTS_PER_WINDOW ? new Date(now.getTime() + COMMENT_BLOCK_MS) : null;
    await tx.commentRateLimit.upsert({
      where: { key },
      create: { key, attempts, windowStartedAt: now, blockedUntil },
      update: {
        attempts,
        windowStartedAt: windowExpired ? now : current.windowStartedAt,
        blockedUntil,
      },
    });

    return blockedUntil
      ? { limited: true as const, retryAfterSeconds: Math.ceil(COMMENT_BLOCK_MS / 1000) }
      : { limited: false as const };
  }, { isolationLevel: "Serializable" });
}

export type PublicComment = {
  id: string;
  content: string;
  status: CommentStatus;
  authorLabel: string;
  createdAt: string;
  editedAt: string | null;
  isOwn: boolean;
  reportedByViewer: boolean;
  replies: PublicComment[];
};

const commentSelect = {
  id: true,
  content: true,
  status: true,
  createdAt: true,
  editedAt: true,
  authorId: true,
  author: { select: { id: true, role: true } },
  reports: { select: { reporterId: true } },
} satisfies Prisma.CommentSelect;

type SelectedComment = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;

function serializeComment(comment: SelectedComment, viewerId: string | null): PublicComment {
  return {
    id: comment.id,
    content: comment.content,
    status: comment.status,
    authorLabel: commentAuthorLabel(comment.author),
    createdAt: comment.createdAt.toISOString(),
    editedAt: comment.editedAt?.toISOString() ?? null,
    isOwn: comment.authorId === viewerId,
    reportedByViewer: comment.reports.some(({ reporterId }) => reporterId === viewerId),
    replies: [],
  };
}

export async function listPublicComments(postId: string, viewerId: string | null) {
  const visibility = viewerId
    ? { OR: [{ status: "PUBLISHED" as const }, { authorId: viewerId }] }
    : { status: "PUBLISHED" as const };
  const roots = await prisma.comment.findMany({
    where: { postId, parentId: null, deletedAt: null, ...visibility },
    orderBy: { createdAt: "asc" },
    select: {
      ...commentSelect,
      replies: {
        where: { deletedAt: null, ...visibility },
        orderBy: { createdAt: "asc" },
        select: commentSelect,
      },
    },
  });

  return roots.map((root) => ({
    ...serializeComment(root, viewerId),
    replies: root.replies.map((reply) => serializeComment(reply, viewerId)),
  }));
}

export async function hasDuplicateComment(authorId: string, postId: string, content: string, now = new Date()) {
  return Boolean(await prisma.comment.findFirst({
    where: {
      authorId,
      postId,
      content,
      deletedAt: null,
      createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    },
    select: { id: true },
  }));
}
