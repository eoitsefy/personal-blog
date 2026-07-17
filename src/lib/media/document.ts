import { getMaxUploadBytes, MediaValidationError, safeOriginalName } from "./image";

type DocumentFormat = {
  mime: "application/pdf" | "text/plain" | "text/markdown";
  extension: "pdf" | "txt" | "md";
};

export type ValidatedDocument = {
  bytes: Buffer;
  originalName: string;
  kind: "DOCUMENT";
  mime: DocumentFormat["mime"];
  extension: DocumentFormat["extension"];
  size: number;
  width: null;
  height: null;
  durationMs: null;
};

const PDF_ACTIVE_CONTENT = /\/(?:JavaScript|JS|Launch|EmbeddedFile|RichMedia|OpenAction)\b/i;
const DISALLOWED_TEXT_DOCUMENT = /^\s*(?:<!doctype\s+html\b|<html\b|<svg\b)/i;

function validatePdf(bytes: Buffer, extension: string, declaredMime: string): DocumentFormat {
  if (declaredMime !== "application/pdf" || extension !== "pdf") {
    throw new MediaValidationError("PDF 的 MIME 类型或扩展名不匹配");
  }
  if (bytes.length < 16 || !bytes.subarray(0, 8).toString("ascii").match(/^%PDF-1\.[0-7]/)) {
    throw new MediaValidationError("PDF 文件头无效");
  }
  if (!bytes.subarray(Math.max(0, bytes.length - 1024)).toString("latin1").includes("%%EOF")) {
    throw new MediaValidationError("PDF 文件不完整");
  }
  if (PDF_ACTIVE_CONTENT.test(bytes.toString("latin1"))) {
    throw new MediaValidationError("PDF 包含脚本、附件或其他主动内容，已拒绝上传");
  }
  return { mime: "application/pdf", extension: "pdf" };
}

function validateUtf8Text(bytes: Buffer, extension: string, declaredMime: string): DocumentFormat {
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new MediaValidationError("文本文件必须使用 UTF-8 编码");
  }
  if (content.includes("\0") || /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(content)) {
    throw new MediaValidationError("文本文件包含不允许的控制字符");
  }
  if (DISALLOWED_TEXT_DOCUMENT.test(content)) {
    throw new MediaValidationError("不支持上传 HTML 或 SVG 文档");
  }

  const isGenericTextMime = declaredMime === "" || declaredMime === "application/octet-stream" || declaredMime === "text/plain";
  if (extension === "txt" && isGenericTextMime) {
    return { mime: "text/plain", extension: "txt" };
  }
  if ((extension === "md" || extension === "markdown") && (isGenericTextMime || declaredMime === "text/markdown" || declaredMime === "text/x-markdown")) {
    return { mime: "text/markdown", extension: "md" };
  }
  throw new MediaValidationError("文档 MIME 类型与扩展名不匹配");
}

export async function validateDocumentUpload(file: File): Promise<ValidatedDocument> {
  const maxBytes = getMaxUploadBytes();
  if (file.size < 1) throw new MediaValidationError("文档文件不能为空");
  if (file.size > maxBytes) throw new MediaValidationError(`文档不能超过 ${Math.floor(maxBytes / 1024 / 1024)} MiB`);

  const bytes = Buffer.from(await file.arrayBuffer());
  const originalName = safeOriginalName(file.name, "document");
  const extension = originalName.toLowerCase().split(".").pop() ?? "";
  const declaredMime = file.type.toLowerCase();
  const format = declaredMime === "application/pdf"
    ? validatePdf(bytes, extension, declaredMime)
    : validateUtf8Text(bytes, extension, declaredMime);

  return {
    bytes,
    originalName,
    kind: "DOCUMENT",
    mime: format.mime,
    extension: format.extension,
    size: bytes.byteLength,
    width: null,
    height: null,
    durationMs: null,
  };
}
