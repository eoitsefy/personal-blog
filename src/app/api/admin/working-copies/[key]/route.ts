import { fail, ok } from "@/lib/api";
import { DraftKeySchema, SaveWorkingCopySchema } from "@/lib/editor-state";
import { EditorConflictError, lockPost, lockWorkingCopy } from "@/lib/post-revisions";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { readJsonMutation } from "@/lib/request-security";

type Context = { params: Promise<{ key: string }> };

export async function GET(req: Request, { params }: Context) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const parsed = DraftKeySchema.safeParse((await params).key);
  if (!parsed.success) return fail("BAD_REQUEST", "工作副本标识无效", 400, auth.requestId);
  const key = parsed.data;
  if (key !== "new" && !await prisma.post.findFirst({ where: { id: key, deletedAt: null }, select: { id: true } })) {
    return fail("NOT_FOUND", "文章不存在或已删除", 404, auth.requestId);
  }
  const copy = await prisma.postWorkingCopy.findUnique({ where: { userId_key: { userId: auth.user.id, key } },
    select: { payload: true, version: true, baseUpdatedAt: true, updatedAt: true, cleared: true } });
  return ok({ copy }, auth.requestId);
}

export async function PUT(req: Request, { params }: Context) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const keyResult = DraftKeySchema.safeParse((await params).key);
  if (!keyResult.success) return fail("BAD_REQUEST", "工作副本标识无效", 400, auth.requestId);
  const body = await readJsonMutation(req);
  if (!body.ok) return fail("BAD_REQUEST", body.failure.message, body.failure.status, auth.requestId);
  const parsed = SaveWorkingCopySchema.safeParse(body.value);
  if (!parsed.success) return fail("BAD_REQUEST", "工作副本内容过长或格式无效", 400, auth.requestId);
  const key = keyResult.data;
  try {
    const copy = await prisma.$transaction(async (tx) => {
      if (key !== "new") {
        await lockPost(tx, key);
        if (!await tx.post.findFirst({ where: { id: key, deletedAt: null }, select: { id: true } })) {
          throw new EditorConflictError("文章已删除，无法继续自动保存");
        }
      }
      await lockWorkingCopy(tx, auth.user.id, key);
      const where = { userId_key: { userId: auth.user.id, key } };
      const existing = await tx.postWorkingCopy.findUnique({ where });
      if ((existing?.version ?? 0) !== parsed.data.version) {
        throw new EditorConflictError("其他窗口已更新工作副本；当前内容仍保留，请复制后重新打开编辑器");
      }
      const data = { payload: parsed.data.state, baseUpdatedAt: parsed.data.baseUpdatedAt, version: parsed.data.version + 1, cleared: false };
      return tx.postWorkingCopy.upsert({ where, create: { ...data, userId: auth.user.id, key, postId: key === "new" ? null : key }, update: data,
        select: { version: true, updatedAt: true } });
    });
    return ok({ copy }, auth.requestId);
  } catch (error) {
    if (error instanceof EditorConflictError) return fail("CONFLICT", error.message, 409, auth.requestId);
    console.error("[working-copy] save failed");
    return fail("INTERNAL_ERROR", "自动保存失败，请保留当前页面并重试", 500, auth.requestId);
  }
}
