import { getMaxUploadBytes, MediaValidationError, safeOriginalName } from "./image";

type AudioFormat = {
  mime: "audio/mpeg" | "audio/wav" | "audio/ogg";
  extension: "mp3" | "wav" | "ogg" | "opus";
  sourceExtensions: ReadonlySet<string>;
  acceptedMimes: ReadonlySet<string>;
  durationMs: number | null;
};

export type ValidatedAudio = {
  bytes: Buffer;
  originalName: string;
  kind: "AUDIO";
  mime: AudioFormat["mime"];
  extension: AudioFormat["extension"];
  size: number;
  width: null;
  height: null;
  durationMs: number | null;
};

function ascii(bytes: Buffer, start: number, end: number) {
  return bytes.subarray(start, end).toString("ascii");
}

function hasMpegFrame(bytes: Buffer, start = 0, scanBytes = 128 * 1024) {
  const limit = Math.min(bytes.length - 3, start + scanBytes);
  for (let index = start; index < limit; index += 1) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const layer = (second >> 1) & 0x03;
    const bitrateIndex = (third >> 4) & 0x0f;
    const sampleRateIndex = (third >> 2) & 0x03;
    if (first === 0xff && (second & 0xe0) === 0xe0 && layer !== 0 && bitrateIndex > 0 && bitrateIndex < 15 && sampleRateIndex < 3) {
      return true;
    }
  }
  return false;
}

function detectWav(bytes: Buffer): AudioFormat | null {
  if (bytes.length < 44 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 12) !== "WAVE") return null;

  let offset = 12;
  let byteRate = 0;
  let dataBytes = 0;
  while (offset + 8 <= bytes.length) {
    const chunk = ascii(bytes, offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (body + size > bytes.length) break;
    if (chunk === "fmt " && size >= 16) {
      const format = bytes.readUInt16LE(body);
      if (format !== 1 && format !== 3) throw new MediaValidationError("WAV 仅支持 PCM 或浮点编码");
      byteRate = bytes.readUInt32LE(body + 8);
    }
    if (chunk === "data") dataBytes = size;
    offset = body + size + (size % 2);
  }
  if (byteRate < 1 || dataBytes < 1) throw new MediaValidationError("WAV 文件缺少有效音频数据");

  return {
    mime: "audio/wav",
    extension: "wav",
    sourceExtensions: new Set(["wav"]),
    acceptedMimes: new Set(["audio/wav", "audio/wave", "audio/x-wav"]),
    durationMs: Math.round((dataBytes / byteRate) * 1000),
  };
}

function detectOgg(bytes: Buffer): AudioFormat | null {
  if (bytes.length < 32 || ascii(bytes, 0, 4) !== "OggS") return null;
  if (bytes[4] !== 0) throw new MediaValidationError("OGG 版本无效");
  const segmentCount = bytes[26] ?? 0;
  if (bytes.length < 27 + segmentCount) throw new MediaValidationError("OGG 页头不完整");
  let payloadBytes = 0;
  for (let index = 0; index < segmentCount; index += 1) payloadBytes += bytes[27 + index] ?? 0;
  const pageEnd = 27 + segmentCount + payloadBytes;
  if (payloadBytes < 8 || pageEnd > bytes.length) throw new MediaValidationError("OGG 数据页不完整");
  const firstPage = bytes.subarray(27 + segmentCount, pageEnd);
  const isOpus = firstPage.includes(Buffer.from("OpusHead"));
  const isVorbis = firstPage.includes(Buffer.from("vorbis"));
  if (!isOpus && !isVorbis) throw new MediaValidationError("OGG 仅支持 Opus 或 Vorbis 音频");
  return {
    mime: "audio/ogg",
    extension: isOpus ? "opus" : "ogg",
    sourceExtensions: isOpus ? new Set(["ogg", "opus"]) : new Set(["ogg", "oga"]),
    acceptedMimes: new Set(["audio/ogg", "audio/opus"]),
    durationMs: null,
  };
}

function detectMp3(bytes: Buffer): AudioFormat | null {
  const hasId3 = bytes.length >= 10 && ascii(bytes, 0, 3) === "ID3";
  const id3Size = hasId3
    ? ((bytes[6] ?? 0) << 21) | ((bytes[7] ?? 0) << 14) | ((bytes[8] ?? 0) << 7) | (bytes[9] ?? 0)
    : 0;
  const audioStart = hasId3 ? 10 + id3Size : 0;
  const frameFound = hasMpegFrame(bytes, audioStart, 256 * 1024);
  if (!hasId3 && !frameFound) return null;
  if (!frameFound) throw new MediaValidationError("MP3 文件缺少有效音频帧");
  return {
    mime: "audio/mpeg",
    extension: "mp3",
    sourceExtensions: new Set(["mp3"]),
    acceptedMimes: new Set(["audio/mpeg", "audio/mp3"]),
    durationMs: null,
  };
}

export async function validateAudioUpload(file: File): Promise<ValidatedAudio> {
  const maxBytes = getMaxUploadBytes();
  if (file.size < 1) throw new MediaValidationError("音频文件不能为空");
  if (file.size > maxBytes) throw new MediaValidationError(`音频不能超过 ${Math.floor(maxBytes / 1024 / 1024)} MiB`);

  const bytes = Buffer.from(await file.arrayBuffer());
  const originalName = safeOriginalName(file.name, "audio");
  const sourceExtension = originalName.toLowerCase().split(".").pop() ?? "";
  const format = detectWav(bytes) ?? detectOgg(bytes) ?? detectMp3(bytes);
  if (!format) throw new MediaValidationError("仅支持 MP3、WAV、OGG 或 Opus 音频");
  if (!format.acceptedMimes.has(file.type)) throw new MediaValidationError("音频 MIME 类型与实际内容不一致");
  if (!format.sourceExtensions.has(sourceExtension)) throw new MediaValidationError("音频扩展名与实际内容不一致");

  return {
    bytes,
    originalName,
    kind: "AUDIO",
    mime: format.mime,
    extension: format.extension,
    size: bytes.byteLength,
    width: null,
    height: null,
    durationMs: format.durationMs,
  };
}
