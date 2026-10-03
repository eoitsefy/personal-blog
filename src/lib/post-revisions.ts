import type { Prisma } from "@prisma/client";
import { EditorStateSchema, editorState } from "@/lib/editor-state";

export const REVISION_LIMIT = 20;
export class EditorConflictError extends Error {}

export async function lockPost(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "Post" WHERE "id" = ${id} FOR UPDATE`;
}

export async function lockWorkingCopy(tx: Prisma.TransactionClient, userId: string, key: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`editor:${userId}:${key}`}))::text`;
}

export async function clearWorkingCopy(tx: Prisma.TransactionClient, userId: string, key: string, version?: number) {
  if (version === undefined) return;
  await lockWorkingCopy(tx, userId, key);
  const copy = await tx.postWorkingCopy.findUnique({ where: { userId_key: { userId, key } } });
  if ((copy?.version ?? 0) !== version) throw new EditorConflictError("工作副本已在其他窗口更新，请重新打开编辑器");
  if (copy) await tx.postWorkingCopy.update({ where: { id: copy.id }, data: { cleared: true, payload: {}, version: { increment: 1 } } });
}

export async function recordPostRevision(tx: Prisma.TransactionClient, postId: string) {
  const post = await tx.post.findUniqueOrThrow({ where: { id: postId }, include: {
    category: true, tags: { include: { tag: true } }, assets: true, places: true,
  } });
  const payload = editorState({ title: post.title, slug: post.slug, excerpt: post.excerpt ?? "", contentMd: post.contentMd,
    status: post.status, category: post.category?.name ?? "", tags: post.tags.map(({ tag }) => tag.name),
    assetIds: post.assets.map(({ assetId }) => assetId), placeIds: post.places.map(({ placeId }) => placeId) });
  const latest = await tx.postRevision.findFirst({ where: { postId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  const previous = latest ? EditorStateSchema.safeParse(latest.payload) : null;
  // A legacy or malformed snapshot must not prevent saving the current article.
  if (previous?.success && JSON.stringify(previous.data) === JSON.stringify(payload)) return;
  await tx.postRevision.create({ data: { postId, payload } });
  const old = await tx.postRevision.findMany({ where: { postId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: REVISION_LIMIT, select: { id: true } });
  if (old.length) await tx.postRevision.deleteMany({ where: { id: { in: old.map(({ id }) => id) } } });
}
