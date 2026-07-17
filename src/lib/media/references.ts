import type { Prisma } from "@prisma/client";

export class InvalidAssetReferenceError extends Error {}

const LOCAL_ASSET_URL = /\/uploads\/[a-z0-9][a-z0-9/_-]*\.(?:jpg|jpeg|png|webp|mp3|wav|ogg|opus)/g;

export function extractLocalAssetUrls(markdown: string) {
  return [...new Set(markdown.match(LOCAL_ASSET_URL) ?? [])];
}

export async function syncPostAssets(
  tx: Prisma.TransactionClient,
  postId: string,
  requestedAssetIds: string[],
  markdown = "",
) {
  const localUrls = extractLocalAssetUrls(markdown);
  const linkedAssets = localUrls.length > 0
    ? await tx.asset.findMany({
        where: { url: { in: localUrls }, deletedAt: null, isPublic: true },
        select: { id: true, url: true },
      })
    : [];
  if (new Set(linkedAssets.map(({ url }) => url)).size !== localUrls.length) {
    throw new InvalidAssetReferenceError("正文包含不存在或已删除的本地媒体文件");
  }

  const assetIds = [...new Set([...requestedAssetIds, ...linkedAssets.map(({ id }) => id)])];
  const existingRefs = await tx.postAssetRef.findMany({
    where: { postId },
    select: { assetId: true },
  });
  const existingIds = new Set(existingRefs.map(({ assetId }) => assetId));

  if (assetIds.length > 0) {
    const activeCount = await tx.asset.count({
      where: { id: { in: assetIds }, deletedAt: null, isPublic: true },
    });
    if (activeCount !== assetIds.length) {
      throw new InvalidAssetReferenceError("包含不存在或已删除的媒体文件");
    }
  }

  const nextIds = new Set(assetIds);
  const added = assetIds.filter((id) => !existingIds.has(id));
  const removed = [...existingIds].filter((id) => !nextIds.has(id));

  if (removed.length > 0) {
    await tx.postAssetRef.deleteMany({ where: { postId, assetId: { in: removed } } });
    await tx.asset.updateMany({
      where: { id: { in: removed }, refCount: { gt: 0 } },
      data: { refCount: { decrement: 1 } },
    });
  }

  if (added.length > 0) {
    const claimed = await tx.asset.updateMany({
      where: { id: { in: added }, deletedAt: null, isPublic: true },
      data: { refCount: { increment: 1 } },
    });
    if (claimed.count !== added.length) {
      throw new InvalidAssetReferenceError("媒体文件状态已变化，请刷新后重试");
    }
    await tx.postAssetRef.createMany({
      data: added.map((assetId) => ({ postId, assetId })),
    });
  }
}
