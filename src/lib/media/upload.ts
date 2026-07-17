import { validateAudioUpload } from "./audio";
import { MediaValidationError, validateImageUpload } from "./image";

export type ValidatedAssetUpload = {
  bytes: Buffer;
  originalName: string;
  kind: "IMAGE" | "AUDIO";
  mime: string;
  extension: string;
  size: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
};

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const AUDIO_MIMES = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav", "audio/ogg", "audio/opus"]);

export async function validateAssetUpload(file: File): Promise<ValidatedAssetUpload> {
  if (IMAGE_MIMES.has(file.type)) {
    const image = await validateImageUpload(file);
    return { ...image, kind: "IMAGE", durationMs: null };
  }
  if (AUDIO_MIMES.has(file.type)) return validateAudioUpload(file);
  throw new MediaValidationError("仅支持 JPEG、PNG、WebP、MP3、WAV、OGG 或 Opus 文件");
}
