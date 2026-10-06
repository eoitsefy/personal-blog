// Read-only final gate. Candidate generation and technical success never grant
// art approval or impersonate a production-ready native Cubism eye rig.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),base=resolve(root,'docs/assistant/left-collar-release-v1');
const hash=b=>createHash('sha256').update(b).digest('hex');
const json=async name=>JSON.parse(await readFile(resolve(base,name),'utf8'));
const m=await json('atlas-candidate.json'),a=await json('review/art-review.json'),b=await json('review/browser-local.json'),c=await json('source-candidate.json');
const scope=hash(Object.values(m.assets).map(v=>v.src+':'+v.sha256).sort().join('\n'));
assert.equal(a.status,'APPROVED_SCOPED_FINISH');assert.equal(a.nativeIntermediateRig,'REJECTED_RETAINED');
assert.equal(a.futureVersionsAuthorized,false);assert.equal(a.legacyBodyArtReapproved,false);
assert.equal(a.assetScopeSha256,scope);assert.equal(b.assetScopeSha256,scope);assert.equal(b.characterVersion,'original-left-collar-release-v1');
assert.equal(a.finishedScopeSha256,hash(c.frameHashes.join('')));assert.equal(a.nativeSourceScopeSha256,hash(c.sourceHashes.join('')));
for(const value of Object.values(m.assets)){
  assert.match(value.src,/^\/assistant\/chibi-[a-z0-9-]+\.(webp|png)$/);
  const bytes=await readFile(resolve(root,'public'+value.src));assert.equal(hash(bytes),value.sha256);assert.equal(bytes.length,value.bytes);
}
for(const index of m.assets['pilot-blink'].sourceIndices)assert.equal(hash(await readFile(resolve(base,`frames/idle/${String(index).padStart(3,'0')}.png`))),c.frameHashes[index]);
assert.equal(b.accepted,true);assert.equal(b.noAIRequests,true);assert.equal(b.bitmapCacheLimit,8);assert.equal(b.reducedMotion,true);assert.equal(b.fallback,true);
assert.deepEqual(b.results.map(r=>r.width),[1280,768,390,320]);
for(const r of b.results){assert.equal(r.poses,217);assert.equal(r.persistentCanvas,true);assert.equal(r.sharedNeutral,true);assert.equal(r.fixedViewport,true);assert.equal(r.hiDpi,true);assert.ok(r.maxBootMidpointDrift<=1.25);}
console.log(JSON.stringify({releaseAllowed:true,assetScopeSha256:scope,assets:Object.keys(m.assets).length,nativeRigReleased:false}));
