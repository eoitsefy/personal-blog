import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateVideoFile } from "./video-file";

const fixture = (ext: string) => readFile(`src/integration/fixtures/video.${ext}`);
const max = 1024 ** 3;
async function withTemp(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "video-check-"));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
function mp4Parts(bytes: Buffer) {
  let p = 0; const parts: Buffer[] = [];
  while (p < bytes.length) { const n = bytes.readUInt32BE(p); assert.ok(n >= 8 && p+n <= bytes.length); if (bytes.toString("ascii", p+4, p+8) !== "mdat") parts.push(bytes.subarray(p,p+n)); p += n; }
  return Buffer.concat(parts);
}
async function sparseMp4(path: string, size: number) {
  const metadata = mp4Parts(await fixture("mp4"));
  const file = await open(path, "w");
  try { await file.write(metadata, 0, metadata.length, 0); const header = Buffer.alloc(8); header.writeUInt32BE(size-metadata.length); header.write("mdat",4); await file.write(header,0,8,metadata.length); await file.truncate(size); } finally { await file.close(); }
}
test("file validator accepts actual MP4, MOV and WebM fixtures", async () => withTemp(async dir => {
  for (const [ext,mime] of [["mp4","video/mp4"],["mov","video/quicktime"],["webm","video/webm"]]) {
    const path=join(dir,ext); await writeFile(path,await fixture(ext)); const result=await validateVideoFile(path,`clip.${ext}`,mime);
    assert.equal(result.width,64); assert.equal(result.height,48); assert.equal(result.kind,"VIDEO");
  }
}));
test("sparse MP4 accepts sizes over 64 MiB and exactly 1 GiB, rejects above limit", async () => withTemp(async dir => {
  const path=join(dir,"large");
  for (const size of [65*1024**2,max]) { await sparseMp4(path,size); assert.equal((await validateVideoFile(path,"large.mp4","video/mp4")).size,size); }
  await sparseMp4(path,max+1); await assert.rejects(validateVideoFile(path,"large.mp4","video/mp4"),/超过/);
}));
test("rejects invalid MIME, truncation, forged box sizes, absent media and video tracks", async () => withTemp(async dir => {
  const path=join(dir,"bad"); const bytes=await fixture("mp4");
  await writeFile(path,bytes); await assert.rejects(validateVideoFile(path,"x.mp4","text/html"));
  await writeFile(path,bytes.subarray(0,100)); await assert.rejects(validateVideoFile(path,"x.mp4","video/mp4"));
  const bad=Buffer.from(bytes); bad.writeUInt32BE(0x7fffffff,0); await writeFile(path,bad); await assert.rejects(validateVideoFile(path,"x.mp4","video/mp4"));
  await writeFile(path,mp4Parts(bytes)); await assert.rejects(validateVideoFile(path,"x.mp4","video/mp4"));
  const noVideo=Buffer.from(bytes); const i=noVideo.indexOf(Buffer.from("vide")); assert.ok(i>0); noVideo.write("soun",i); await writeFile(path,noVideo); await assert.rejects(validateVideoFile(path,"x.mp4","video/mp4"));
  const webm=await fixture("webm"); await writeFile(path,webm.subarray(0,90)); await assert.rejects(validateVideoFile(path,"x.webm","video/webm"));
}));
test("rejects oversized metadata without reading it", async () => withTemp(async dir => {
  const path=join(dir,"metadata"); const file=await open(path,"w"); try { const h=Buffer.alloc(16); h.writeUInt32BE(8,0); h.write("ftyp",4); h.writeUInt32BE(33*1024**2,8); h.write("moov",12); await file.write(h); await file.truncate(8+33*1024**2); } finally { await file.close(); }
  await assert.rejects(validateVideoFile(path,"x.mp4","video/mp4"), /元数据/);
}));
