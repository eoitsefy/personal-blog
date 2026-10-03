import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { REVISION_LIMIT } from "@/lib/post-revisions";
import { EditorStateSchema } from "@/lib/editor-state";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!await prisma.post.findFirst({ where: { id, deletedAt: null }, select: { id: true } })) {
    return fail("NOT_FOUND", "文章不存在或已删除", 404, auth.requestId);
  }
  const revisionId = new URL(req.url).searchParams.get("revision");
  if (revisionId) {
    const revision = await prisma.postRevision.findFirst({ where: { id: revisionId, postId: id }, select: { id: true, payload: true, createdAt: true } });
    if (!revision) return fail("NOT_FOUND", "该版本已过期或不存在", 404, auth.requestId);
    return ok({ revision }, auth.requestId);
  }
  const versions = await prisma.postRevision.findMany({ where: { postId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: REVISION_LIMIT });
  return ok({ revisions: versions.map((version) => {
    const payload = EditorStateSchema.safeParse(version.payload);
    return { id: version.id, createdAt: version.createdAt,
      title: payload.success ? payload.data.form.title : "旧格式版本（无法直接恢复）" };
  }) }, auth.requestId);
}
