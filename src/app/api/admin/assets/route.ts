import { Prisma } from "@prisma/client";
import { mkdir } from "node:fs/promises";
import { fail, logApi, ok } from "@/lib/api";
import { MediaValidationError } from "@/lib/media/image";
import { ensureUploadSpace, receiveAssetUpload, UploadRequestError, UploadSpaceError, UploadTooLargeError, type ReceivedUpload } from "@/lib/media/receive-upload";
import { getMediaStorageQuotaBytes, mediaStorageStatus, wouldExceedMediaStorageQuota } from "@/lib/media/quota";
import { ADMIN_ASSET_PAGE_SIZE, adminAssetListQuerySchema } from "@/lib/media/validators";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { validateMutationOrigin } from "@/lib/request-security";
import { createAssetKey, getLocalStorage, getUploadRoot, publicAssetUrl } from "@/lib/storage/local";

const assetSelect = {
  id: true,
  url: true,
  originalName: true,
  kind: true,
  mime: true,
  size: true,
  width: true,
  height: true,
  durationMs: true,
  refCount: true,
  deletedAt: true,
  createdAt: true,
} satisfies Prisma.AssetSelect;

class MediaStorageQuotaError extends Error {}

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const parsed = adminAssetListQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return fail("BAD_REQUEST", "查询参数无效", 400, auth.requestId);

  const query = parsed.data;
  const where: Prisma.AssetWhereInput = {
    deletedAt: query.deleted === "trash" ? { not: null } : null,
    kind: query.kind === "ALL" ? undefined : query.kind,
    refCount: query.referenced === "REFERENCED" ? { gt: 0 } : query.referenced === "UNUSED" ? 0 : undefined,
    originalName: query.q ? { contains: query.q, mode: "insensitive" } : undefined,
  };
  const [total, assets, usage] = await Promise.all([
    prisma.asset.count({ where }),
    prisma.asset.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * ADMIN_ASSET_PAGE_SIZE,
      take: ADMIN_ASSET_PAGE_SIZE,
      select: assetSelect,
    }),
    prisma.asset.aggregate({ _sum: { size: true } }),
  ]);

  return ok({
    assets,
    pagination: {
      page: query.page,
      pageSize: ADMIN_ASSET_PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / ADMIN_ASSET_PAGE_SIZE)),
    },
    storage: mediaStorageStatus(usage._sum.size ?? 0),
  }, auth.requestId);
}

export async function POST(req: Request) {
  const start = Date.now();
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const originFailure = validateMutationOrigin(req);
  if (originFailure) return fail("FORBIDDEN", originFailure.message, originFailure.status, auth.requestId);

  let key = "";
  let received: ReceivedUpload | undefined;
  const storage = getLocalStorage();
  try {
    received = await receiveAssetUpload(req);
    const { upload, sha256 } = received;
    await mkdir(getUploadRoot(), { recursive: true, mode: 0o750 });
    await ensureUploadSpace(getUploadRoot(), upload.size);
    const quotaBytes = getMediaStorageQuotaBytes();
    // The potentially large disk copy must not hold a database transaction open.
    key = createAssetKey(upload.extension);
    if (upload.sourcePath) await storage.writeFromFile(key, upload.sourcePath);
    else if (upload.bytes) await storage.write(key, upload.bytes);
    else throw new Error("Validated upload has no content");
    const asset = await prisma.$transaction(async (tx) => {
      // Prisma cannot deserialize PostgreSQL's void return type, so expose the lock result as text.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(734281946)::text AS "lockResult"`;
      const usage = await tx.asset.aggregate({ _sum: { size: true } });
      if (wouldExceedMediaStorageQuota(usage._sum.size ?? 0, upload.size, quotaBytes)) {
        throw new MediaStorageQuotaError();
      }

      return tx.asset.create({
        data: {
          ossKey: key,
          url: publicAssetUrl(key),
          originalName: upload.originalName,
          kind: upload.kind,
          mime: upload.mime,
          size: upload.size,
          width: upload.width,
          height: upload.height,
          durationMs: upload.durationMs,
          sha256,
          ownerId: auth.user.id,
        },
        select: assetSelect,
      });
    });

    logApi({
      requestId: auth.requestId,
      path: "/api/admin/assets",
      method: "POST",
      status: 201,
      latencyMs: Date.now() - start,
      userId: auth.user.id,
    });
    return ok({ asset }, auth.requestId, 201);
  } catch (error) {
    if (key && !(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) {
      await storage.delete(key).catch(() => undefined);
    }
    if (error instanceof UploadTooLargeError) return fail("BAD_REQUEST", error.message, 413, auth.requestId);
    if (error instanceof UploadRequestError) return fail("BAD_REQUEST", error.message, error.status, auth.requestId);
    if (error instanceof UploadSpaceError) return fail("CONFLICT", error.message, 507, auth.requestId);
    if (error instanceof MediaStorageQuotaError) {
      return fail("CONFLICT", "媒体存储空间不足，请永久删除不再使用的回收站文件后重试", 507, auth.requestId);
    }
    if (error instanceof MediaValidationError) {
      return fail("BAD_REQUEST", error.message, 400, auth.requestId);
    }
    console.error("[POST /api/admin/assets] failed", error);
    return fail("INTERNAL_ERROR", "媒体上传失败", 500, auth.requestId);
  } finally {
    await received?.cleanup().catch(() => undefined);
  }
}
