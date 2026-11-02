/* eslint-disable @typescript-eslint/no-require-imports -- Runs as CommonJS stdin inside the isolated production container. */
// Isolated CI only. Embedded fixture matches src/integration/fixtures/video.mp4.
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { PrismaClient } = require('@prisma/client');
assert.equal(process.env.CI, 'true');
const database = new URL(process.env.DATABASE_URL);
assert.ok(['postgres:', 'postgresql:'].includes(database.protocol));
assert.ok(['127.0.0.1', 'localhost'].includes(database.hostname));
assert.ok(database.pathname.endsWith('_test'));
const base = 'http://127.0.0.1:3000';
const fixture = Buffer.from('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', 'base64');
assert.equal(createHash('sha256').update(fixture).digest('hex'), 'cb66009f68b6d7deca1b643ba8ab0561c9e85821d78dc461efa3b8af044592db');
const db = new PrismaClient();
const token = randomBytes(32).toString('base64url');
assert.match(token, /^[A-Za-z0-9_-]{43}$/);
const cookie = `blog_session=${token}`;
const boundary = 'ci-' + randomUUID();
const start = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="ci-large.mp4"\r\nContent-Type: video/mp4\r\n\r\n`);
const end = Buffer.from(`\r\n--${boundary}--\r\n`);
const size = 1024 ** 3;
const box = Buffer.alloc(8); box.writeUInt32BE(size - fixture.length); box.write('free', 4);
const zero = Buffer.alloc(1024 * 1024);
let userId = '';
async function response(req) {
  const [res] = await once(req, 'response'); const chunks=[]; let n=0;
  for await (const chunk of res) { n+=chunk.length; if(n>1024*1024) throw Error('Response exceeds 1 MiB'); chunks.push(chunk); }
  return {status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)};
}
async function upload() {
  const req=http.request(base+'/api/admin/assets',{method:'POST',headers:{cookie,origin:base,'content-type':`multipart/form-data; boundary=${boundary}`,'content-length':String(start.length+size+end.length)}});
  const result=response(req); const write=async b=>{if(!req.write(b)) await once(req,'drain');};
  try { await write(start); await write(fixture); await write(box); let left=size-fixture.length-box.length;
    while(left){const n=Math.min(left,zero.length);await write(zero.subarray(0,n));left-=n;}
    req.end(end); return await result;
  } catch(e){req.destroy();await result.catch(()=>{});throw e;}
}
async function call(url, options={}) {
  const r=await fetch(base+url,{...options,headers:{cookie,origin:base,...options.headers},signal:AbortSignal.timeout(60000)});
  const chunks=[];let length=0;
  for await(const chunk of r.body||[]){length+=chunk.length;if(length>1024*1024)throw Error('Response exceeds 1 MiB');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);
  return {status:r.status,headers:r.headers,body:bytes};
}
(async()=>{
  let failed;
  try {
    const user=await db.user.create({data:{email:`large-ci-${randomUUID()}@example.invalid`,passwordHash:'!ci-only',role:'ADMIN'}});userId=user.id;
    await db.userSession.create({data:{userId,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+3600000)}});
    const req=http.request(base+'/api/admin/assets',{method:'POST',headers:{cookie,origin:base,'content-type':`multipart/form-data; boundary=${boundary}`,'content-length':String(size+1000001)}});
    const pending=response(req);req.flushHeaders();const over=await pending;req.destroy();assert.equal(over.status,413);
    const result=await upload();assert.equal(result.status,201,result.body.toString());const asset=JSON.parse(result.body).data.asset;assert.equal(asset.size,size);assert.ok(asset.url.startsWith('/uploads/'));
    const h=await call(asset.url,{method:'HEAD'});assert.equal(h.status,200);assert.equal(Number(h.headers.get('content-length')),size);
    const first=await call(asset.url,{headers:{range:'bytes=0-15'}});assert.equal(first.status,206);assert.deepEqual(first.body,fixture.subarray(0,16));
    const last=await call(asset.url,{headers:{range:`bytes=${size-16}-${size-1}`}});assert.equal(last.status,206);assert.deepEqual(last.body,Buffer.alloc(16));
    const events=await readFile('/sys/fs/cgroup/memory.events','utf8');assert.match(events,/^oom_kill 0$/m);const peak=await readFile('/sys/fs/cgroup/memory.peak','utf8');console.log(JSON.stringify({large_video_bytes:size,head:200,ranges:206,oom_kill:0,memory_peak:Number(peak)}));
  } catch(e) {failed=e;}
  try {
    if(userId){const owned=await db.asset.findMany({where:{ownerId:userId},select:{id:true}});for(const a of owned){const d=await call(`/api/admin/assets/${a.id}`,{method:'DELETE'});assert.equal(d.status,200);const p=await call(`/api/admin/assets/${a.id}/purge`,{method:'DELETE'});assert.equal(p.status,200);}assert.equal(await db.asset.count({where:{ownerId:userId}}),0);await db.user.delete({where:{id:userId}});assert.equal(await db.userSession.count({where:{userId}}),0);}
  } catch(e){failed=failed||e;console.error('CI_OWNED_CLEANUP_FAILED',e.message);}
  await db.$disconnect();if(failed)throw failed;
})().catch(e=>{console.error(e);process.exitCode=1});
