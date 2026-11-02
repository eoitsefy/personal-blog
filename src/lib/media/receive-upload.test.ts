import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { receiveAssetUpload } from './receive-upload';

const boundary='test-boundary-123';
const head=(name:string,mime:string,field='file')=>Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`);
const end=Buffer.from(`\r\n--${boundary}--\r\n`);
function request(parts:Buffer[], declared?:number, signal?:AbortSignal) {
 const actual=parts.reduce((n,p)=>n+p.length,0); let i=0,offset=0;
 const body=new ReadableStream<Uint8Array>({pull(c){ if(i>=parts.length){c.close();return;} const p=parts[i]; const next=Math.min(offset+65536,p.length); c.enqueue(p.subarray(offset,next)); offset=next;if(offset===p.length){i++;offset=0;} }});
 const req=new Request('http://localhost/upload',{method:'POST',headers:{'content-type':`multipart/form-data; boundary=${boundary}`,'content-length':String(declared??actual)},body,duplex:'half',signal} as RequestInit);
 req.formData=async()=>{throw new Error('formData must not be called')}; return req;
}
async function isolated(fn:(dir:string)=>Promise<void>){const dir=await mkdtemp(path.join(os.tmpdir(),'receive-test-'));const old=process.env.TEMP,oldtmp=process.env.TMP;process.env.TEMP=dir;process.env.TMP=dir;try{await fn(dir)}finally{if(old===undefined)delete process.env.TEMP;else process.env.TEMP=old;if(oldtmp===undefined)delete process.env.TMP;else process.env.TMP=oldtmp;await rm(dir,{recursive:true,force:true})}}
const fixture=(ext:string)=>readFile(`src/integration/fixtures/video.${ext}`);
test('streamed MP4 MOV and WebM accepted without formData and cleanup',async()=>isolated(async dir=>{
 for(const [ext,mime] of [['mp4','video/mp4'],['mov','video/quicktime'],['webm','video/webm']]){const r=await receiveAssetUpload(request([head(`clip.${ext}`,mime),await fixture(ext),end]));assert.equal(r.upload.kind,'VIDEO');assert.ok(r.upload.sourcePath);assert.ok((await stat(r.upload.sourcePath!)).size>0);await r.cleanup();assert.deepEqual(await readdir(dir),[])}
}));
test('large valid video is received in chunks over 64 MiB',async()=>isolated(async dir=>{
 const bytes=await fixture('mp4');let p=0;const metadata:Buffer[]=[];while(p<bytes.length){const n=bytes.readUInt32BE(p);if(bytes.toString('ascii',p+4,p+8)!=='mdat')metadata.push(bytes.subarray(p,p+n));p+=n}
 const size=65*1024**2;const prefix=Buffer.concat(metadata);const box=Buffer.alloc(8);box.writeUInt32BE(size-prefix.length);box.write('mdat',4);const zero=Buffer.alloc(1024*1024);const chunks=[head('large.mp4','video/mp4'),prefix,box];let remaining=size-prefix.length-8;while(remaining){const n=Math.min(remaining,zero.length);chunks.push(zero.subarray(0,n));remaining-=n}chunks.push(end);
 const r=await receiveAssetUpload(request(chunks));assert.equal((await stat(r.upload.sourcePath!)).size,size);await r.cleanup();assert.deepEqual(await readdir(dir),[])
}));
test('malformed, extra fields, double files, wrong field and length rejected and cleaned',async()=>isolated(async dir=>{
 const file=await fixture('mp4'),h=head('x.mp4','video/mp4');const second=Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="extra"\r\n\r\nvalue`);
 for(const parts of [[head('x.mp4','video/mp4','wrong'),file,end],[h,file,second,end],[h,file,Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="y.mp4"\r\nContent-Type: video/mp4\r\n\r\n`),file,end],[h,file]]){await assert.rejects(receiveAssetUpload(request(parts)));assert.deepEqual(await readdir(dir),[])}
 const parts=[h,file,end];const n=parts.reduce((a,b)=>a+b.length,0);for(const declared of [n-1,n+1,1024**3+1_000_001]){await assert.rejects(receiveAssetUpload(request(parts,declared)));assert.deepEqual(await readdir(dir),[])}
 const bad=new Request('http://localhost',{method:'POST',headers:{'content-type':'multipart/form-data;','content-length':'1'},body:'x'});await assert.rejects(receiveAssetUpload(bad));assert.deepEqual(await readdir(dir),[])
}));
test('non-video respects 8 MiB cap; abort cleans temporary files',async()=>isolated(async dir=>{
 const data=Buffer.alloc(8*1024**2+1,65);await assert.rejects(receiveAssetUpload(request([head('large.txt','text/plain'),data,end])));assert.deepEqual(await readdir(dir),[]);
 const ac=new AbortController();ac.abort();await assert.rejects(receiveAssetUpload(request([head('x.mp4','video/mp4'),await fixture('mp4'),end],undefined,ac.signal)));assert.deepEqual(await readdir(dir),[])
}));

test('streamed image retains privacy sanitization',async()=>isolated(async dir=>{
 const {privatePhotoFixture,PRIVATE_PHOTO_MARKER}=await import('../../test-support/image-privacy');const sharp=(await import('sharp')).default;const bytes=await privatePhotoFixture('jpeg');assert.ok(bytes.includes(Buffer.from(PRIVATE_PHOTO_MARKER)));const r=await receiveAssetUpload(request([head('photo.jpg','image/jpeg'),bytes,end]));assert.ok(r.upload.bytes);assert.equal(r.upload.bytes!.includes(Buffer.from(PRIVATE_PHOTO_MARKER)),false);assert.equal((await sharp(r.upload.bytes!).metadata()).exif,undefined);await r.cleanup();assert.deepEqual(await readdir(dir),[])
}));

test('abort during streaming cleans partial file',async()=>isolated(async dir=>{
 const ac=new AbortController();let calls=0;const h=head('large.mp4','video/mp4');const stream=new ReadableStream<Uint8Array>({pull(c){if(calls++===0)c.enqueue(h);else if(calls<4)c.enqueue(Buffer.alloc(65536));else {ac.abort();c.close()}}});const req=new Request('http://localhost/upload',{method:'POST',headers:{'content-type':`multipart/form-data; boundary=${boundary}`,'content-length':'1000000'},body:stream,duplex:'half',signal:ac.signal} as RequestInit);await assert.rejects(receiveAssetUpload(req));assert.deepEqual(await readdir(dir),[])
}));
