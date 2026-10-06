// Read-only scoped gates. Quantitative success never grants art approval.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {BLINK_INDICES,EYE_POLYGONS,insideEye,closureAt,lineStyle,refineEye} from './blink-refinement.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const pack='docs/assistant/blink-refinement-v1/',parent='docs/assistant/left-collar-release-v1/';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function verifyBlinkTechnical(base=root){
 const read=p=>readFile(resolve(base,p)),json=async p=>JSON.parse((await read(p)).toString('utf8'));
 const codeHash=async p=>hash((await read(p)).toString('utf8').replace(/\r\n/g,'\n'));
 const m=await json(pack+'candidate.json'),pm=await json(parent+'atlas-candidate.json'),pc=await json(parent+'source-candidate.json');
 assert.equal(m.deployAllowed,false);assert.equal(m.nativeRigReleased,false);assert.equal(m.codeHashFormat,'UTF-8-LF');
 assert.deepEqual(m.eyePolygons,EYE_POLYGONS);assert.deepEqual(m.rect,pc.rect);assert.equal(m.scale,pc.scale);
 assert.deepEqual(m.indices,BLINK_INDICES);assert.equal(m.frames.length,68);
 assert.deepEqual(m.times,BLINK_INDICES.map(i=>Math.min(i,119)*1000/30));
 for(const n of [48,49])assert.ok(Math.abs(m.times[m.indices.indexOf(n+1)]-m.times[m.indices.indexOf(n)]-1000/30)<1e-8);
 assert.equal(m.generatorSha256,await codeHash('scripts/animation/prepare-blink-refinement.mjs'));
 assert.equal(m.eyeModuleSha256,await codeHash('scripts/animation/blink-refinement.mjs'));
 assert.equal(m.lockfileSha256,await codeHash('package-lock.json'));
 assert.deepEqual(m.closedStyle,lineStyle(1));assert.ok(Math.abs(m.closedStyle.width-2)<1e-10);
 assert.deepEqual(m.keptAssets,Object.fromEntries(Object.entries(pm.assets).filter(([k])=>k!=='pilot-blink')));
 const neutral=await read(parent+'source/original-neutral.png'),skinBytes=await read(parent+'source/skin-backfill.png');
 assert.equal(hash(neutral),m.originalNeutralSha256);assert.equal(hash(skinBytes),m.skinBackfillSha256);
 const open=await sharp(neutral).ensureAlpha().raw().toBuffer(),skin=await sharp(skinBytes).resize(768,768).ensureAlpha().raw().toBuffer();
 const atlasBytes=await read(pack+'idle.webp');assert.equal(m.asset.src,'/assistant/chibi-idle-blink-refined-v1.webp');
 assert.ok((await read('public'+m.asset.src)).equals(atlasBytes));assert.equal(hash(atlasBytes),m.asset.sha256);assert.equal(atlasBytes.length,m.asset.bytes);
 const {data:atlas,info}=await sharp(atlasBytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(info.width,2196);assert.equal(info.height,5520);
 const mask=[];for(let y=294;y<370;y++)for(let x=300;x<465;x++)if(insideEye(x+.5,y+.5))mask.push((y*768+x)*4);
 const frames=[],stats=[];let changedFrames=0,maxAdjacentMean=0;
 for(const[i,f]of m.frames.entries()){
  const name=String(m.indices[i]).padStart(3,'0')+'.png';assert.equal(f.frame,m.indices[i]);
  assert.equal(f.sourcePath,f.frame===49?pack+'source/049.png':parent+'frames/idle/'+name);
  assert.equal(f.outputPath,closureAt(f.frame)>0?pack+'frames/'+name:f.sourcePath);
  const source=await read(f.sourcePath),bytes=await read(f.outputPath);assert.equal(hash(source),pc.frameHashes[f.frame]);assert.equal(hash(source),f.sourceSha256);assert.equal(hash(bytes),f.sha256);
  const before=await sharp(source).ensureAlpha().raw().toBuffer(),after=await sharp(bytes).ensureAlpha().raw().toBuffer();
  assert.equal(after.length,768*768*4);let changes=0;
  for(let p=0;p<768*768;p++){
   const n=p*4;assert.equal(after[n+3],before[n+3],'Alpha changed');
   if(!insideEye(p%768+.5,Math.floor(p/768)+.5))assert.ok(after.subarray(n,n+4).equals(before.subarray(n,n+4)),'Non-eye pixels changed');
   if(!after.subarray(n,n+3).equals(before.subarray(n,n+3)))changes++;
  }
  if(changes)changedFrames++;else assert.ok(bytes.equals(source),'Untouched PNG was re-encoded');
  assert.ok((await refineEye(before,open,skin,f.frame)).equals(after),'Current eye algorithm does not reproduce frozen pixels');
  for(let y=0;y<m.rect.height;y++)for(let x=0;x<m.rect.width;x++){
   const a=((Math.floor(i/6)*460+y)*info.width+i%6*366+x)*4,b=((y+m.rect.top)*768+x+m.rect.left)*4;
   assert.equal(atlas[a+3],after[b+3]);if(after[b+3])assert.ok(atlas.subarray(a,a+3).equals(after.subarray(b,b+3)));
  }
  const dark=mask.filter(n=>after[n+3]>200&&.2126*after[n]+.7152*after[n+1]+.0722*after[n+2]<70).length;
  let adjacent=0;if(frames.length){const previous=frames.at(-1);for(const n of mask)for(let c=0;c<3;c++)adjacent+=Math.abs(after[n+c]-previous[n+c]);adjacent/=mask.length*3;maxAdjacentMean=Math.max(maxAdjacentMean,adjacent);}
  stats.push({frame:f.frame,dark,adjacentMean:adjacent});frames.push(after);
 }
 assert.equal(changedFrames,12);assert.ok(frames[0].equals(frames.at(-1)));
 const baseline=stats.find(f=>f.frame===36).dark;for(const n of[37,48])assert.ok(stats.find(f=>f.frame===n).dark<=baseline*1.02,'Edge ink overshoot');
 assert.ok(maxAdjacentMean<=32.2634,'Blink difference concentrated into a worse frame');
 assert.equal(m.frameScopeSha256,hash(m.frames.map(f=>f.sha256).join('')));
 for(const a of Object.values(m.keptAssets)){assert.match(a.src,/^\/assistant\/chibi-[a-z0-9-]+\.(png|webp)$/);const b=await read('public'+a.src);assert.equal(hash(b),a.sha256);assert.equal(b.length,a.bytes);}
 const scope=hash([m.asset,...Object.values(m.keptAssets)].map(a=>a.src+':'+a.sha256).sort().join('\n'));assert.equal(scope,m.assetScopeSha256);
 return{technicalOnly:true,assetScopeSha256:scope,frameScopeSha256:m.frameScopeSha256,changedFrames,nonEyePixelChanges:0,alphaChanges:0,maxAdjacentMean,stats,nativeRigReleased:false};
}
export function verifyBlinkApproval(a,b,m){
 assert.equal(a.status,'APPROVED_SCOPED_EYE_REFINEMENT');assert.equal(a.futureVersionsAuthorized,false);assert.equal(a.nativeRigReleased,false);assert.equal(a.legacyBodyArtReapproved,false);
 assert.equal(a.assetScopeSha256,m.assetScopeSha256);assert.equal(a.frameScopeSha256,m.frameScopeSha256);
 for(const name of['blink_art_audit','blink_timing_audit','blink_release_audit']){const r=a.reviewers.find(r=>r.name===name);assert.ok(r,'Independent reviewer missing');assert.equal(r.status,'PASS');assert.equal(r.assetScopeSha256,m.assetScopeSha256);}
 assert.equal(b.assetScopeSha256,m.assetScopeSha256);assert.equal(b.frameScopeSha256,m.frameScopeSha256);assert.equal(b.characterVersion,'original-left-collar-blink-refined-v1');
 for(const field of['accepted','noAIRequests','reducedMotion','fallback','fallbackDecoded','actualAssetHashesVerified'])assert.equal(b[field],true);
 assert.equal(b.fallbackSha256,m.keptAssets.fallback.sha256);
 assert.equal(b.bitmapCacheLimit,8);assert.deepEqual(b.results.map(r=>r.width),[1280,768,390,320]);
 const expectedResources=Object.fromEntries([m.asset,...Object.values(m.keptAssets)].filter(a=>!a.src.endsWith('.png')).sort((a,b)=>a.src.localeCompare(b.src)).map(a=>[a.src,a.sha256]));
 for(const r of b.results){assert.equal(r.poses,218);for(const f of['persistentCanvas','sharedNeutral','fixedViewport','hiDpi','actualAssetHashesVerified'])assert.equal(r[f],true);assert.ok(r.maxBootMidpointDrift<=1.25);assert.deepEqual(r.resourceSha256,expectedResources);}
 assert.deepEqual(b.playback.map(p=>[p.rate,p.loops]),[[1,3],[.5,1]]);
 for(const p of b.playback){
  assert.ok(Number.isFinite(p.stopTime)&&p.stopTime>=p.loops*4000);assert.ok(Number.isFinite(p.maxPaintGap)&&p.maxPaintGap>0&&p.maxPaintGap<=250);
  assert.ok(p.changes.length>0);let previous=-1;
  for(const c of p.changes){assert.ok(Number.isFinite(c.time)&&c.time>=previous&&c.time<=p.stopTime);assert.match(c.pose,/^pilot-blink:[0-9]+$/);previous=c.time;}
  for(let cycle=0;cycle<p.loops;cycle++)for(let i=0;i<m.indices.length;i++)if(m.indices[i]>=36&&m.indices[i]<=50)assert.ok(p.changes.some(c=>c.time>=cycle*4000&&c.time<(cycle+1)*4000&&c.pose===`pilot-blink:${i}`),'Playback evidence omitted a blink sample');
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const technical=await verifyBlinkTechnical(),m=JSON.parse(await readFile(resolve(root,pack+'candidate.json'),'utf8'));
 const a=JSON.parse(await readFile(resolve(root,pack+'review/art-review.json'),'utf8')),b=JSON.parse(await readFile(resolve(root,pack+'review/browser-local.json'),'utf8'));
 verifyBlinkApproval(a,b,m);console.log(JSON.stringify({...technical,releaseAllowed:true,stats:undefined}));
}
