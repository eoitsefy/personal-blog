import sharp, { type Metadata } from "sharp";

const DEFAULT_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_EDGE = 10_000;
const MAX_IMAGE_PIXELS = 40_000_000;

const IMAGE_FORMATS = {
  jpeg: { mime: "image/jpeg", extension: "jpg", sourceExtensions: new Set(["jpg", "jpeg"]) },
  png: { mime: "image/png", extension: "png", sourceExtensions: new Set(["png"]) },
  webp: { mime: "image/webp", extension: "webp", sourceExtensions: new Set(["webp"]) },
} as const;

type SupportedFormat = keyof typeof IMAGE_FORMATS;

export class MediaValidationError extends Error {}

export type ValidatedImage = {
  bytes: Buffer;
  originalName: string;
  mime: string;
  extension: string;
  size: number;
  width: number;
  height: number;
};

export function getMaxUploadBytes() {
  const configured = Number(process.env.MAX_UPLOAD_BYTES);
  return Number.isSafeInteger(configured) && configured > 0
    ? Math.min(configured, 20 * 1024 * 1024)
    : DEFAULT_MAX_UPLOAD_BYTES;
}

export function safeOriginalName(input: string, fallback = "asset") {
  const basename = input.replace(/\\/g, "/").split("/").pop()?.trim() || fallback;
  return basename.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 180) || fallback;
}

export async function validateImageUpload(file: File): Promise<ValidatedImage> {
  const maxBytes = getMaxUploadBytes();
  if (file.size < 1) throw new MediaValidationError("图片文件不能为空");
  if (file.size > maxBytes) throw new MediaValidationError(`图片不能超过 ${Math.floor(maxBytes / 1024 / 1024)} MiB`);

  const bytes = Buffer.from(await file.arrayBuffer());
  const originalName = safeOriginalName(file.name, "image");
  const sourceExtension = originalName.toLowerCase().split(".").pop() ?? "";

  let metadata: Metadata;
  try {
    metadata = await sharp(bytes, {
      failOn: "error",
      limitInputPixels: MAX_IMAGE_PIXELS,
      sequentialRead: true,
    }).metadata();
  } catch {
    throw new MediaValidationError("图片内容无效或尺寸过大");
  }

  const format = metadata.format as SupportedFormat | undefined;
  const config = format ? IMAGE_FORMATS[format] : undefined;
  if (!config) throw new MediaValidationError("仅支持 JPEG、PNG 和 WebP 图片");
  if (file.type !== config.mime) throw new MediaValidationError("图片 MIME 类型与实际内容不一致");
  if (!config.sourceExtensions.has(sourceExtension as never)) {
    throw new MediaValidationError("图片扩展名与实际内容不一致");
  }
  if ((metadata.pages ?? 1) > 1) throw new MediaValidationError("暂不支持动画图片");

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < 1 || height < 1 || width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE || width * height > MAX_IMAGE_PIXELS) {
    throw new MediaValidationError("图片尺寸超出允许范围");
  }

  return {
    bytes,
    originalName,
    mime: config.mime,
    extension: config.extension,
    size: bytes.byteLength,
    width,
    height,
  };
}
