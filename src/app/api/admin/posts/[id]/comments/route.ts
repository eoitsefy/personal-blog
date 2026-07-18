import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { readJsonMutation } from "@/lib/request-security";
import { requireAdmin } from "@/lib/require-admin";

const Schema = z.object({ locked: z.boolean() });

export async function PATCH(req: Request, context: RouteContext<"/api/admin/posts/[id]/comments">) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const body = await readJsonMutation(req, 4_096);
  if (!body.ok) return fail("BAD_REQUEST", body.failure.message, body.failure.status, auth.requestId);
  const parsed = Schema.safeParse(body.value);
  if (!parsed.success) return fail("BAD_REQUEST", "评论区状态无效", 400, auth.requestId);
  const { id } = await context.params;
  const result = await prisma.post.updateMany({
    where: { id },
    data: { commentsLocked: parsed.data.locked },
  });
  if (result.count !== 1) return fail("NOT_FOUND", "文章不存在", 404, auth.requestId);
  return ok({ commentsLocked: parsed.data.locked }, auth.requestId);
}
