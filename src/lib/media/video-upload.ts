import { MediaValidationError, safeOriginalName } from "./image";

export function getMaxVideoUploadBytes() {
  const configured = Number(process.env.MAX_VIDEO_UPLOAD_BYTES);
  return Number.isSafeInteger(configured) && configured > 0
    ? Math.min(configured, 64 * 1024 * 1024) : 64 * 1024 * 1024;
}

function invalid(): never { throw new MediaValidationError("视频容器不完整或不含有效视频轨道，请导出为 MP4（H.264）或 WebM 后重试"); }
type Box = { type: string; start: number; end: number };

// Bounded structural inspection, not decoding or transcoding. Never interpret file contents as URLs.
function boxes(bytes: Buffer, start = 0, end = bytes.length): Box[] {
  const result: Box[] = [];
  while (start < end) {
    if (result.length > 10_000 || start + 8 > end) invalid();
    let size = bytes.readUInt32BE(start);
    const type = bytes.toString("ascii", start + 4, start + 8);
    let header = 8;
    if (size === 1) {
      if (start + 16 > end) invalid();
      const large = bytes.readBigUInt64BE(start + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) invalid();
      size = Number(large); header = 16;
    } else if (size === 0) size = end - start;
    if (size < header || start + size > end) invalid();
    result.push({ type, start: start + header, end: start + size });
    start += size;
  }
  return result;
}

function inspectMp4(bytes: Buffer, extension: string) {
  const top = boxes(bytes);
  const ftyp = top.find(b => b.type === "ftyp");
  const moov = top.find(b => b.type === "moov");
  if (!ftyp || ftyp.start !== 8 || ftyp.end - ftyp.start < 8 || !moov || !top.some(b => b.type === "mdat" && b.end > b.start)) invalid();
  const brand = bytes.toString("ascii", ftyp.start, ftyp.start + 4);
  if (extension === "mov" ? brand !== "qt  " : !/^(?:isom|iso[2-9]|mp4[12]|avc1|M4V |MSNV|dash)$/.test(brand)) invalid();
  for (const track of boxes(bytes, moov.start, moov.end).filter(b => b.type === "trak")) {
    const mdia = boxes(bytes, track.start, track.end).find(b => b.type === "mdia");
    if (!mdia) continue;
    const children = boxes(bytes, mdia.start, mdia.end);
    const hdlr = children.find(b => b.type === "hdlr");
    if (!hdlr || hdlr.end - hdlr.start < 12 || bytes.toString("ascii", hdlr.start + 8, hdlr.start + 12) !== "vide") continue;
    const minf = children.find(b => b.type === "minf");
    if (!minf) invalid();
    const stbl = boxes(bytes, minf.start, minf.end).find(b => b.type === "stbl");
    if (!stbl) invalid();
    const stsd = boxes(bytes, stbl.start, stbl.end).find(b => b.type === "stsd");
    if (!stsd || stsd.end - stsd.start < 8) invalid();
    const entries = boxes(bytes, stsd.start + 8, stsd.end);
    if (bytes.readUInt32BE(stsd.start + 4) !== entries.length) invalid();
    const entry = entries.find(b => ["avc1", "avc3", "hvc1", "hev1", "av01", "vp09"].includes(b.type));
    if (!entry || entry.end - entry.start < 78) invalid();
    const width = bytes.readUInt16BE(entry.start + 24), height = bytes.readUInt16BE(entry.start + 26);
    const config = boxes(bytes, entry.start + 78, entry.end);
    if (!config.some(b => ["avcC", "hvcC", "av1C", "vpcC"].includes(b.type) && b.end > b.start)) invalid();
    if (!width || !height || width > 8192 || height > 8192) invalid();
    return { width, height };
  }
  invalid();
}

type Element = { id: number; start: number; end: number };
function vint(bytes: Buffer, offset: number, id = false) {
  const first = bytes[offset]; if (!first) invalid();
  let length = 1, mask = 0x80;
  while (!(first & mask)) { length++; mask >>= 1; }
  if (length > (id ? 4 : 8) || offset + length > bytes.length) invalid();
  let value = BigInt(id ? first : first & (mask - 1));
  for (let i = 1; i < length; i++) value = (value << BigInt(8)) | BigInt(bytes[offset + i]);
  return { length, value, unknown: !id && value === (BigInt(1) << BigInt(7 * length)) - BigInt(1) };
}
function elements(bytes: Buffer, start: number, end: number): Element[] {
  const result: Element[] = [];
  while (start < end) {
    if (result.length > 10_000) invalid();
    const id = vint(bytes, start, true), size = vint(bytes, start + id.length);
    const body = start + id.length + size.length;
    if (body > end || size.value > BigInt(Number.MAX_SAFE_INTEGER)) { if (!size.unknown) invalid(); }
    const finish = size.unknown ? end : body + Number(size.value);
    if (finish > end || finish < body || (size.unknown && id.value !== BigInt(0x18538067))) invalid();
    result.push({ id: Number(id.value), start: body, end: finish }); start = finish;
  }
  return result;
}
function uint(bytes: Buffer, element?: Element) {
  if (!element || element.end <= element.start || element.end - element.start > 4) invalid();
  return bytes.readUIntBE(element.start, element.end - element.start);
}
function inspectWebm(bytes: Buffer) {
  const top = elements(bytes, 0, bytes.length);
  if (top[0]?.id !== 0x1a45dfa3) invalid();
  const header = elements(bytes, top[0].start, top[0].end);
  const doc = header.find(e => e.id === 0x4282);
  if (!doc || bytes.toString("ascii", doc.start, doc.end) !== "webm") invalid();
  const segment = top.find(e => e.id === 0x18538067); if (!segment) invalid();
  const children = elements(bytes, segment.start, segment.end);
  if (!children.some(e => e.id === 0x1f43b675 && elements(bytes, e.start, e.end).some(block => [0xa3, 0xa0].includes(block.id) && block.end - block.start > 4))) invalid();
  const tracks = children.find(e => e.id === 0x1654ae6b); if (!tracks) invalid();
  for (const track of elements(bytes, tracks.start, tracks.end).filter(e => e.id === 0xae)) {
    const fields = elements(bytes, track.start, track.end);
    if (uint(bytes, fields.find(e => e.id === 0x83)) !== 1) continue;
    const codec = fields.find(e => e.id === 0x86), video = fields.find(e => e.id === 0xe0);
    if (!codec || !video || !["V_VP8", "V_VP9", "V_AV1"].includes(bytes.toString("ascii", codec.start, codec.end))) invalid();
    const dimensions = elements(bytes, video.start, video.end);
    const width = uint(bytes, dimensions.find(e => e.id === 0xb0)), height = uint(bytes, dimensions.find(e => e.id === 0xba));
    if (!width || !height || width > 8192 || height > 8192) invalid();
    return { width, height };
  }
  invalid();
}

export async function validateVideoUpload(file: File) {
  const maxBytes = getMaxVideoUploadBytes();
  if (!file.size) throw new MediaValidationError("视频文件不能为空");
  if (file.size > maxBytes) throw new MediaValidationError(`视频不能超过 ${Math.floor(maxBytes / 1024 / 1024)} MiB`);
  const originalName = safeOriginalName(file.name, "video");
  const extension = originalName.toLowerCase().split(".").pop() ?? "";
  const mime = ({ mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" } as Record<string, string>)[extension];
  if (!mime) throw new MediaValidationError("视频仅支持 MP4、MOV 或 WebM");
  if (![mime, "application/octet-stream", ""].includes(file.type)) throw new MediaValidationError("视频 MIME 类型与扩展名不一致");
  const bytes = Buffer.from(await file.arrayBuffer());
  const dimensions = extension === "webm" ? inspectWebm(bytes) : inspectMp4(bytes, extension);
  return { bytes, originalName, kind: "VIDEO" as const, mime, extension, size: bytes.length, ...dimensions, durationMs: null };
}
