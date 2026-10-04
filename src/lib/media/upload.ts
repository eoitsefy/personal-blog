import { validateAudioUpload } from "./audio";
import { validateDocumentUpload } from "./document";
import { MediaValidationError, validateImageUpload } from "./image";
import { validateVideoUpload } from "./video-upload";

export type ValidatedAssetUpload = {
  bytes: Buffer;
  originalName: string;
  kind: "IMAGE" | "AUDIO" | "DOCUMENT" | "VIDEO";
  mime: string;
  extension: string;
  size: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
};

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const AUDIO_MIMES = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav", "audio/ogg", "audio/opus"]);
const DOCUMENT_MIMES = new Set(["application/pdf", "text/plain", "text/markdown", "text/x-markdown"]);

export async function validateAssetUpload(file: File): Promise<ValidatedAssetUpload> {
  if (file.type.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(file.name)) return validateVideoUpload(file);
  if (IMAGE_MIMES.has(file.type)) {
    const image = await validateImageUpload(file);
    return { ...image, kind: "IMAGE", durationMs: null };
  }
  if (AUDIO_MIMES.has(file.type)) return validateAudioUpload(file);
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  const isGenericTextDocument = (file.type === "" || file.type === "application/octet-stream")
    && (extension === "txt" || extension === "md" || extension === "markdown");
  if (DOCUMENT_MIMES.has(file.type) || isGenericTextDocument) return validateDocumentUpload(file);
  throw new MediaValidationError("仅支持图片、MP3/WAV/OGG/Opus、MP4/MOV/WebM、PDF、TXT 或 Markdown 文件");
}
