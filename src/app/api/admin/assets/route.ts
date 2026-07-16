import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { fail, logApi, ok } from "@/lib/api";
import { getMaxUploadBytes, MediaValidationError, validateImageUpload } from "@/lib/media/image";
import { ADMIN_ASSET_PAGE_SIZE, adminAssetListQuerySchema } from "@/lib/media/validators";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { validateMutationOrigin } from "@/lib/request-security";
import { createAssetKey, getLocalStorage, publicAssetUrl } from "@/lib/storage/local";

const assetSelect = {
  id: true,
  url: true,
  originalName: true,
  mime: true,
  size: true,
  width: true,
  height: true,
  refCount: true,
  deletedAt: true,
  createdAt: true,
} satisfies Prisma.AssetSelect;

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const parsed = adminAssetListQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return fail("BAD_REQUEST", "查询参数无效", 400, auth.requestId);

  const query = parsed.data;
  const where: Prisma.AssetWhereInput = {
    deletedAt: query.deleted === "trash" ? { not: null } : null,
  };
  const [total, assets] = await Promise.all([
    prisma.asset.count({ where }),
    prisma.asset.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * ADMIN_ASSET_PAGE_SIZE,
      take: ADMIN_ASSET_PAGE_SIZE,
      select: assetSelect,
    }),
  ]);

  return ok({
    assets,
    pagination: {
      page: query.page,
      pageSize: ADMIN_ASSET_PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / ADMIN_ASSET_PAGE_SIZE)),
    },
  }, auth.requestId);
}

export async function POST(req: Request) {
  const start = Date.now();
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const originFailure = validateMutationOrigin(req);
  if (originFailure) return fail("FORBIDDEN", originFailure.message, originFailure.status, auth.requestId);

  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("multipart/form-data;")) {
    return fail("BAD_REQUEST", "上传请求必须使用 multipart/form-data", 415, auth.requestId);
  }

  const maxBytes = getMaxUploadBytes();
  const rawContentLength = req.headers.get("content-length");
  const contentLength = Number(rawContentLength);
  if (!rawContentLength || !Number.isSafeInteger(contentLength) || contentLength <= 0) {
    return fail("BAD_REQUEST", "上传请求必须提供有效的 Content-Length", 411, auth.requestId);
  }
  if (contentLength > maxBytes + 1_000_000) {
    return fail("BAD_REQUEST", "上传请求过大", 413, auth.requestId);
  }

  let key = "";
  const storage = getLocalStorage();
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return fail("BAD_REQUEST", "请选择图片文件", 400, auth.requestId);

    const image = await validateImageUpload(file);
    key = createAssetKey(image.extension);
    await storage.write(key, image.bytes);

    const asset = await prisma.asset.create({
      data: {
        ossKey: key,
        url: publicAssetUrl(key),
        originalName: image.originalName,
        mime: image.mime,
        size: image.size,
        width: image.width,
        height: image.height,
        sha256: createHash("sha256").update(image.bytes).digest("hex"),
        ownerId: auth.user.id,
      },
      select: assetSelect,
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
    if (key) await storage.delete(key).catch(() => undefined);
    if (error instanceof MediaValidationError) {
      return fail("BAD_REQUEST", error.message, 400, auth.requestId);
    }
    console.error("[POST /api/admin/assets] failed", error);
    return fail("INTERNAL_ERROR", "图片上传失败", 500, auth.requestId);
  }
}
