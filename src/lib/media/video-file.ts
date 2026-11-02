import { open } from "node:fs/promises";
import { MediaValidationError } from "./image";
import { getMaxVideoUploadBytes, inspectMp4, inspectWebm, normalizeVideoUpload } from "./video-upload";

const budget = 32 * 1024 * 1024;
function invalid(): never { throw new MediaValidationError("视频容器不完整或不含有效视频轨道，请导出为 MP4（H.264）或 WebM 后重试"); }
export async function validateVideoFile(filePath: string, name: string, mimeType: string) {
  const { originalName, mime, extension } = normalizeVideoUpload(name, mimeType);
  const file = await open(filePath, "r");
  try {
    const { size } = await file.stat();
    if (!size) throw new MediaValidationError("视频文件不能为空");
    const max = getMaxVideoUploadBytes();
    if (size > max) throw new MediaValidationError(`视频不能超过 ${Math.floor(max / 1024 / 1024)} MiB`);
    let used = 0, count = 0;
    async function read(pos: number, len: number) {
      if (pos < 0 || len < 0 || pos + len > size) invalid();
      used += len; if (used > budget) throw new MediaValidationError("视频元数据超过 32 MiB，无法安全检查容器");
      const b = Buffer.alloc(len); const result = await file.read(b, 0, len, pos); if (result.bytesRead !== len) invalid(); return b;
    }
    async function mpBox(pos: number, end: number) {
      if (++count > 10000 || pos + 8 > end) invalid();
      const h = await read(pos, 8); let length = h.readUInt32BE(0), head = 8;
      if (length === 1) { const n = (await read(pos + 8, 8)).readBigUInt64BE(); if (n > BigInt(Number.MAX_SAFE_INTEGER)) invalid(); length = Number(n); head = 16; }
      else if (!length) length = end - pos;
      if (length < head || pos + length > end) invalid();
      return { type: h.toString("ascii", 4), length, head };
    }
    let dimensions: { width: number; height: number };
    if (extension !== "webm") {
      let pos = 0, data = false; const parts: Buffer[] = [];
      while (pos < size) { const b = await mpBox(pos, size); if (pos === 0 && b.type !== "ftyp") invalid(); if (b.type === "mdat" && b.length > b.head) data = true; if (["ftyp", "moov"].includes(b.type)) parts.push(await read(pos, b.length)); pos += b.length; }
      if (!data) invalid();
      parts.push(Buffer.from([0,0,0,9,0x6d,0x64,0x61,0x74,0]));
      dimensions = inspectMp4(Buffer.concat(parts), extension);
    } else {
      async function element(pos: number, end: number) {
        if (++count > 10000 || pos >= end) invalid();
        const h = await read(pos, Math.min(12, end - pos));
        function v(offset: number, id: boolean) { const first = h[offset]; if (!first) invalid(); let n=1, mask=128; while (!(first & mask)) { n++; mask >>= 1; } if (n > (id ? 4 : 8) || offset+n > h.length) invalid(); let value=BigInt(id ? first : first & (mask-1)); for(let i=1;i<n;i++) value=(value<<BigInt(8))|BigInt(h[offset+i]); return {n,value,unknown: !id && value === (BigInt(1) << BigInt(7*n))-BigInt(1)}; }
        const id=v(0,true), length=v(id.n,false), head=id.n+length.n; if (length.value > BigInt(Number.MAX_SAFE_INTEGER) && !length.unknown) invalid();
        const finish=length.unknown ? end : pos+head+Number(length.value); if (finish > end || finish < pos+head || (length.unknown && id.value !== BigInt(0x18538067))) invalid();
        return { id:Number(id.value), body:pos+head, end:finish };
      }
      let pos=0, header:Buffer | undefined, tracks:Buffer | undefined, block=false, segment=false;
      while(pos<size) { const e=await element(pos,size); if(pos===0 && e.id!==0x1a45dfa3) invalid(); if(e.id===0x1a45dfa3 && !header) header=await read(pos,e.end-pos); if(e.id===0x18538067) { segment=true; let p=e.body; while(p<e.end) { const c=await element(p,e.end); if(c.id===0x1654ae6b && !tracks) tracks=await read(p,c.end-p); if(c.id===0x1f43b675 && !block) { let q=c.body; while(q<c.end) { const b=await element(q,c.end); if ([0xa3,0xa0].includes(b.id) && b.end-b.body>4) block=true; q=b.end; } } p=c.end; } } pos=e.end; }
      if(!header || !tracks || !segment || !block) invalid();
      const cluster=Buffer.from([0x1f,0x43,0xb6,0x75,0x87,0xa3,0x85,0,0,0,0,0]);
      const content=Buffer.concat([tracks,cluster]); if(content.length >= 0x0fffffff) invalid();
      const seg=Buffer.alloc(8); seg.writeUInt32BE(0x18538067,0); seg.writeUInt32BE(0x10000000 | content.length,4);
      dimensions=inspectWebm(Buffer.concat([header,seg,content]));
    }
    return { originalName, kind: "VIDEO" as const, mime, extension, size, ...dimensions, durationMs: null };
  } finally { await file.close(); }
}
