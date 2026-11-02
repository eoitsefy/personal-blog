import busboy from "busboy";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, statfs } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getMaxUploadBytes, MediaValidationError } from "./image";
import { validateAssetUpload, type ValidatedAssetUpload } from "./upload";
import { getMaxVideoUploadBytes, normalizeVideoUpload } from "./video-upload";
import { validateVideoFile } from "./video-file";

const MULTIPART_OVERHEAD = 1_000_000;
const SPACE_RESERVE = 32 * 1024 * 1024;

export class UploadTooLargeError extends MediaValidationError {}
export class UploadSpaceError extends Error {}
export class UploadRequestError extends MediaValidationError {
  constructor(message: string, readonly status: number) { super(message); }
}

export type ReceivedUpload = {
  upload: Omit<ValidatedAssetUpload, "bytes"> & { bytes?: Buffer; sourcePath?: string };
  sha256: string;
  cleanup: () => Promise<void>;
};

export async function ensureUploadSpace(directory: string, requiredBytes: number) {
  const space = await statfs(directory);
  if (space.bavail * space.bsize < requiredBytes + SPACE_RESERVE) {
    throw new UploadSpaceError("服务器可用磁盘空间不足，请稍后重试或联系管理员");
  }
}

/** Only the current request's private temporary directory is ever removed. */
export async function receiveAssetUpload(req: Request): Promise<ReceivedUpload> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new UploadRequestError("上传请求必须使用 multipart/form-data", 415);
  }
  const rawLength = req.headers.get("content-length");
  const length = Number(rawLength);
  if (!rawLength || !Number.isSafeInteger(length) || length <= 0) {
    throw new UploadRequestError("上传请求必须提供有效的 Content-Length", 411);
  }
  const maxBody = Math.max(getMaxUploadBytes(), getMaxVideoUploadBytes()) + MULTIPART_OVERHEAD;
  if (length > maxBody) throw new UploadTooLargeError("上传请求超过文件大小限制");
  if (!req.body) throw new MediaValidationError("上传内容为空");
  if (req.signal.aborted) throw new MediaValidationError("上传已中断，请重试");

  let parser: ReturnType<typeof busboy>;
  try {
    parser = busboy({ headers: { "content-type": contentType }, defParamCharset: "utf8",
      limits: { files: 2, fields: 0, parts: 2, fileSize: maxBody, headerPairs: 64 } });
  } catch {
    throw new MediaValidationError("上传表单缺少有效的 multipart 边界");
  }
  await ensureUploadSpace(os.tmpdir(), length);
  const directory = await mkdtemp(path.join(os.tmpdir(), "blog-asset-upload-"));
  const sourcePath = path.join(directory, "file");
  const cleanup = async () => { await rm(directory, { recursive: true, force: true }); };
  let selected: { filename: string; mime: string; video: boolean } | undefined;
  let fileTask: Promise<void> | undefined;
  let fileError: Error | undefined;
  let formError: Error | undefined;
  let fileBytes = 0;
  const hash = createHash("sha256");
  const failForm = (error: Error) => {
    formError ??= error;
    // Drain rejected parts under the global body cap. Destroying the parser
    // inside a multipart callback can tear down its currently active file stream.
  };
  const rejectForm = () => failForm(new MediaValidationError("每次只能上传一个文件，且不能包含额外表单字段"));
  parser.on("filesLimit", rejectForm);
  parser.on("fieldsLimit", rejectForm);
  parser.on("partsLimit", rejectForm);
  parser.on("file", (field, stream, info) => {
    if (formError) { stream.resume(); return; }
    if (selected || field !== "file") { stream.resume(); rejectForm(); return; }
    const video = info.mimeType.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(info.filename);
    try { if (video) normalizeVideoUpload(info.filename, info.mimeType); }
    catch (error) { stream.resume(); failForm(error as Error); return; }
    selected = { filename: info.filename, mime: info.mimeType, video };
    const limit = video ? getMaxVideoUploadBytes() : getMaxUploadBytes();
    const tooLarge = () => new UploadTooLargeError(`${video ? "视频" : "文件"}不能超过 ${limit / 1024 / 1024} MiB`);
    stream.on("limit", () => failForm(tooLarge()));
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        fileBytes += chunk.length;
        if (fileBytes > limit) { callback(tooLarge()); return; }
        hash.update(chunk); callback(null, chunk);
      },
    });
    fileTask = pipeline(stream, counter, createWriteStream(sourcePath, { flags: "wx", mode: 0o600 }))
      .catch((error: Error) => { fileError = error; parser.destroy(error); });
  });
  let bodyBytes = 0;
  const bodyCounter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bodyBytes += chunk.length;
      if (bodyBytes > length || bodyBytes > maxBody) {
        callback(new UploadTooLargeError("上传请求超过声明的大小限制")); return;
      }
      callback(null, chunk);
    },
  });
  const input = Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]);
  const abort = () => input.destroy(new MediaValidationError("上传已中断，请重试"));
  req.signal.addEventListener("abort", abort, { once: true });
  try {
    if (req.signal.aborted) abort();
    await pipeline(input, bodyCounter, parser);
    await fileTask;
    if (formError) throw formError;
    if (fileError) throw fileError;
    if (bodyBytes !== length) throw new MediaValidationError("上传内容不完整，请重试");
    if (!selected || !fileTask) throw new MediaValidationError("请选择媒体文件");
    if (!fileBytes) throw new MediaValidationError("文件不能为空");
    if (selected.video) {
      const upload = await validateVideoFile(sourcePath, selected.filename, selected.mime);
      return { upload: { ...upload, sourcePath }, sha256: hash.digest("hex"), cleanup };
    }
    // Non-video types keep their existing small limit and privacy/content checks.
    const bytes = await readFile(sourcePath);
    const upload = await validateAssetUpload(new File([bytes], selected.filename, { type: selected.mime }));
    return { upload, sha256: createHash("sha256").update(upload.bytes).digest("hex"), cleanup };
  } catch (caught) {
    parser.destroy();
    await fileTask;
    await cleanup();
    const error = formError ?? (caught instanceof MediaValidationError || caught instanceof UploadSpaceError ? caught : fileError ?? caught);
    if (error instanceof MediaValidationError || error instanceof UploadSpaceError) throw error;
    if (error && typeof error === "object" && "code" in error && error.code === "ENOSPC") {
      throw new UploadSpaceError("服务器可用磁盘空间不足，请稍后重试或联系管理员");
    }
    throw new MediaValidationError("上传中断或表单内容不完整，请重试");
  } finally {
    req.signal.removeEventListener("abort", abort);
  }
}
