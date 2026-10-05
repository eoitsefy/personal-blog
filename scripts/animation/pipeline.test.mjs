import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { mkdtemp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { AnimationPipeline, parseManifest, manifestScope, keyScope, safeRelative, validateKeyApproval, validateFinalApproval, validatePlaybackReport, assertResources, sha256, silhouetteMetrics, browserChannel, assertExternalPathLength, resolvePlaywright } from './pipeline.mjs';
const A='a'.repeat(64),B='b'.repeat(64),C='c'.repeat(64);
const manifest=()=>({schemaVersion:1,id:'unit-wave',action:'wave',reference:{file:'reference.png',sha256:A},editableMask:{file:'mask.png',sha256:B},
  keys:[{id:'neutral',file:'reference.png',sha256:A},{id:'pose',file:'pose.png',sha256:C}],canvas:{width:64,height:64,safetyInset:.2},
  motion:{sequence:['neutral','pose','neutral'],stepsPerInterval:2,fps:15,loopDurationMs:1000},interpolation:{method:'hold',gpu:1},
  review:{keyApproval:'key-approval.json',finalApproval:'final-approval.json'}});
const keyReview=scope=>({schemaVersion:1,reviewer:'Unit fixture reviewer',reviewedAt:'2026-10-05T12:00:00Z',scopeSha256:scope,
  status:'APPROVED_FOR_INTERPOLATION_ONLY',interpolationAllowed:true,releaseAllowed:false});

async function fixture() {
  const base=process.platform==='win32'?'D:/CodexTools/assistant-animation/jobs/test-fixtures':resolve(tmpdir(),'animation-pipeline-tests');
  await mkdir(base,{recursive:true});const repoRoot=await mkdtemp(resolve(base,'fixture-')),toolRoot=resolve(repoRoot,'tools');await mkdir(toolRoot);
  const neutral=Buffer.alloc(64*64*4),mask=Buffer.alloc(neutral.length),pose=Buffer.alloc(neutral.length);
  for(let y=24;y<44;y++)for(let x=24;x<44;x++){const p=(y*64+x)*4;neutral.set([30,30,30,255],p);}
  neutral.copy(pose);
  for(let y=25;y<39;y++)for(let x=19;x<27;x++){const p=(y*64+x)*4;mask.fill(255,p,p+4);if(x>=22)pose.set([237,185,155,255],p);}
  for(const [name,data]of [['reference',neutral],['pose',pose],['mask',mask]])await sharp(data,{raw:{width:64,height:64,channels:4}}).png().toFile(resolve(repoRoot,name+'.png'));
  const m=manifest();for(const source of [m.reference,m.editableMask,...m.keys])source.sha256=sha256(await readFile(resolve(repoRoot,source.file)));
  const path=resolve(repoRoot,'manifest.json');await writeFile(path,JSON.stringify(m));
  const pipeline=await AnimationPipeline.load(path,{repoRoot,toolRoot});
  await writeFile(resolve(repoRoot,'key-approval.json'),JSON.stringify(keyReview(pipeline.keyScopeSha256)));
  // Fixtures intentionally stay on D for audit; no recursive cleanup follows paths supplied by a manifest.
  return {pipeline,m,path,repoRoot,toolRoot};
}

test('pipeline strict manifest rejects path escapes, unknown adapters, duplicate keys and invalid timing',()=>{
  for(const path of ['../secret.png','C:/keys/a.png','\\\\server\\x','a\\b.png','a//b.png','a/./b.png','a:stream.png','/absolute.png','art./key.png','art /key.png','art/NUL.png','CON/review.json','keys/com1.png','keys/LPT9.backup.png','keys/CONIN$.json','art/a?.png','art/a*.png','art/a|b.png','art/a<b.png','art/a>b.png','art/a"b.png','art/a\nb.png','art/COM¹.png'])assert.throws(()=>safeRelative(path),path);
  assert.equal(safeRelative('docs/assistant/keys/a.png'),'docs/assistant/keys/a.png');
  const m=manifest();assert.deepEqual(parseManifest(m),m);
  assert.throws(()=>parseManifest({...m,shell:'run paid API'}));
  assert.throws(()=>parseManifest({...m,interpolation:{method:'remote-api',gpu:1}}));
  assert.throws(()=>parseManifest({...m,keys:[m.keys[0],m.keys[0]]}));
  assert.throws(()=>parseManifest({...m,motion:{...m.motion,sequence:['pose','neutral','pose']}}));
  assert.throws(()=>parseManifest({...m,motion:{...m.motion,loopDurationMs:1}}));
});
test('browser report requires all real PNG hashes and complete normal/half cycles, not a PASSED label',()=>{
  const expected={manifestScopeSha256:A,keyScopeSha256:B,frameScopeSha256:C,frameCount:5,sourcePngSha256:[A,A,B,B,A],technicalStatus:'PASSED_TECHNICAL_ONLY'};
  const valid={status:'PASSED_PLAYBACK_ONLY',technicalStatus:expected.technicalStatus,manifestScopeSha256:A,keyScopeSha256:B,frameScopeSha256:C,sourcePngSha256:expected.sourcePngSha256,
    modes:[1,.5].map(speed=>({speed,framesVisited:5,cycles:1,sourcePngHashesVerified:5,pixelMismatchFrames:[]})),paused:true,reducedMotionPaused:true,mobileOverflow:false,errors:[],externalRequests:[],releaseAllowed:false};
  assert.deepEqual(validatePlaybackReport(valid,expected),valid);
  for(const changed of [
    {...valid,manifestScopeSha256:B},{...valid,keyScopeSha256:A},{...valid,frameScopeSha256:B},
    {...valid,sourcePngSha256:[A,A,A,A,A]},{...valid,modes:[]},
    {...valid,modes:valid.modes.map(mode=>({...mode,framesVisited:4}))},
    {...valid,modes:valid.modes.map(mode=>({...mode,cycles:0}))},
    {...valid,modes:valid.modes.map(mode=>({...mode,sourcePngHashesVerified:4}))},
    {...valid,modes:valid.modes.map(mode=>({...mode,pixelMismatchFrames:[1]}))},
    {...valid,modes:[valid.modes[1],valid.modes[0]]},{...valid,paused:false},
    {...valid,reducedMotionPaused:false},{...valid,mobileOverflow:true},
    {...valid,errors:['pageerror']},{...valid,externalRequests:['request']},
    {...valid,releaseAllowed:true},{...valid,technicalStatus:'REJECTED_TECHNICAL'},
    {status:'PASSED_PLAYBACK_ONLY',frameScopeSha256:C},
  ])assert.throws(()=>validatePlaybackReport(changed,expected));
});
test('external tool paths and browser channels are bounded and explicit fallback does not accept relative code paths',async()=>{
  assert.equal(browserChannel('msedge'),'msedge');assert.equal(browserChannel('chrome'),'chrome');assert.equal(browserChannel('chromium'),'chromium');
  for(const bad of ['http://remote','cmd.exe','edge --disable-security',''])assert.throws(()=>browserChannel(bad));
  const base=process.platform==='win32'?'D:/':'/';
  assert.doesNotThrow(()=>assertExternalPathLength([base+'a'.repeat(240-base.length)]));
  assert.throws(()=>assertExternalPathLength([base+'a'.repeat(241-base.length)]),/exceeds_240/);
  assert.throws(()=>assertExternalPathLength(['relative/path']));
  const {repoRoot}=await fixture();
  await assert.rejects(resolvePlaywright(repoRoot,'../malicious.js'),/invalid_playwright_lookup_anchor/);
  await assert.rejects(resolvePlaywright(repoRoot,''),/playwright_missing_configure_explicit_fallback/);
  const modules=resolve(repoRoot,'node_modules/playwright');await mkdir(modules,{recursive:true});
  await writeFile(resolve(modules,'package.json'),JSON.stringify({name:'playwright',main:'index.cjs'}));
  await writeFile(resolve(modules,'index.cjs'),'module.exports={chromium:{syntheticFixture:true}};');
  const resolved=await resolvePlaywright(repoRoot,'../invalid-fallback.js');
  assert.equal(resolved.origin,'repository');assert.equal(resolved.chromium.syntheticFixture,true);
});
test('manifest, key ordering and masks alter approval scopes; review metadata cannot auto-promote a key',()=>{
  const m=manifest(),scope=manifestScope(m);assert.notEqual(scope,manifestScope({...m,motion:{...m.motion,stepsPerInterval:3}}));
  assert.notEqual(keyScope(A,[B,C],A,scope),keyScope(A,[C,B],A,scope));
  assert.notEqual(keyScope(A,[B,C],A,scope),keyScope(A,[B,C],B,scope));
  assert.equal(validateKeyApproval(keyReview(A),A).releaseAllowed,false);
  assert.throws(()=>validateKeyApproval(keyReview(A),B),/stale_key/);
  assert.throws(()=>validateKeyApproval({...keyReview(A),releaseAllowed:true},A));
  assert.throws(()=>validateKeyApproval({...keyReview(A),reviewer:''},A));
  assert.throws(()=>validateFinalApproval(keyReview(A),{manifestScopeSha256:A,keyScopeSha256:B,frameScopeSha256:C}));
});
test('final art approval is bound to every actual output and cannot borrow an old release',()=>{
  const scopes={manifestScopeSha256:A,keyScopeSha256:B,frameScopeSha256:C};
  const review={schemaVersion:1,reviewer:'Independent art review',reviewedAt:'2026-10-05T12:00:00Z',scopeSha256:C,status:'APPROVED_FOR_RELEASE',releaseAllowed:true,...scopes};
  assert.equal(validateFinalApproval(review,scopes).frameScopeSha256,C);
  for(const field of Object.keys(scopes))assert.throws(()=>validateFinalApproval({...review,[field]:'d'.repeat(64)},scopes),/stale_final/);
  assert.throws(()=>validateFinalApproval({...review,status:'REJECTED'},scopes));
});
test('pipeline resource guard rejects invalid numbers, low disk, low RAM and competing inference',()=>{
  const G=1024**3;assert.doesNotThrow(()=>assertResources(8*G,4*G,false));
  assert.throws(()=>assertResources(NaN,5*G,false));assert.throws(()=>assertResources(8*G-1,5*G,false));
  assert.throws(()=>assertResources(9*G,4*G-1,false));assert.throws(()=>assertResources(9*G,5*G,true));
});
test('load is read-only and rejects altered source bytes before any job starts',async()=>{
  const {pipeline,path,repoRoot,toolRoot}=await fixture();
  assert.deepEqual(await readdir(toolRoot),[]);
  assert.equal((await pipeline.status()).paidRequests,0);
  await writeFile(resolve(repoRoot,'pose.png'),Buffer.from('changed source'));
  await assert.rejects(AnimationPipeline.load(path,{repoRoot,toolRoot}),/source_hash_mismatch/);
  assert.deepEqual(await readdir(toolRoot),[]);
});
test('prepared artifacts are immutable and interrupted or concurrent jobs never silently overwrite',async()=>{
  const {pipeline}=await fixture();await pipeline.prepare();
  assert.equal(await pipeline.receiptValid('prepare'),true);
  await assert.rejects(pipeline.immutable('prepared.json',Buffer.from('overwrite')),/immutable_artifact_conflict/);
  await writeFile(await pipeline.output('run.lock'),'fixture stale lock');
  await assert.rejects(pipeline.prepare(),/pipeline_already_running/);
});
test('complete local hold pipeline can resume but cannot package without browser and whole-animation approval',async()=>{
  const {pipeline}=await fixture();
  await pipeline.interpolate();const report=await pipeline.readJson('interpolation.json');
  assert.equal(report.frameCount,5);assert.equal(report.method,'hold');assert.equal(report.independentDrawings,2);assert.equal(report.paidRequests,0);
  assert.equal(report.delayMs.reduce((a,b)=>a+b,0),1000);
  const check=await pipeline.check();assert.equal(check.status,'PASSED_TECHNICAL_ONLY');assert.equal(check.releaseAllowed,false);
  await pipeline.interpolate();assert.equal(await pipeline.receiptValid('interpolate'),true);
  await assert.rejects(pipeline.package(),/browser_playback_not_completed/);
});
test('stale key permission and tampered cached PNGs cannot be reused',async()=>{
  const {pipeline,repoRoot}=await fixture();await pipeline.prepare();
  await writeFile(resolve(repoRoot,'key-approval.json'),JSON.stringify(keyReview(A)));
  await assert.rejects(pipeline.interpolate(),/stale_key_art_approval/);
  await writeFile(resolve(repoRoot,'key-approval.json'),JSON.stringify(keyReview(pipeline.keyScopeSha256)));
  await pipeline.interpolate();
  await writeFile(await pipeline.output('frames/002.png'),await readFile(resolve(repoRoot,'reference.png')));
  await assert.rejects(pipeline.check(),/cached_artifact_hash_mismatch|frame_scope_mismatch/);
});
test('dark sleeve alpha and unconnected limb components are inspected without falsely promising all ghosts are detected',()=>{
  const width=32,height=32,data=Buffer.alloc(width*height*4),mask=Buffer.alloc(data.length);
  for(let y=8;y<20;y++)for(let x=8;x<20;x++){
    const p=(y*width+x)*4;data.set([25,25,25,120],p);mask.fill(255,p,p+4);
  }
  const result=silhouetteMetrics(data,mask,width,height);
  assert.ok(result.translucentInteriorRatio>.02);assert.equal(result.detachedComponents,1);
  // A connected opaque doubled limb can pass these measurements. Human review is independent.
  for(let p=3;p<data.length;p+=4)if(data[p])data[p]=255;
  assert.equal(silhouetteMetrics(data,mask,width,height).translucentInteriorRatio,0);
});
test('empty receipts and old engine caches cannot stand in for a completed stage',async()=>{
  const {pipeline}=await fixture();await pipeline.prepare();
  const receipt=pipeline.state.stages.prepare;
  pipeline.state.stages.prepare={...receipt,artifacts:[]};assert.equal(await pipeline.receiptValid('prepare'),false);
  pipeline.state.stages.prepare={...receipt,engineSha256:A};assert.equal(await pipeline.receiptValid('prepare'),false);
});
test('even a forged matching file receipt cannot hide timeline nodes or alter approved timing',async()=>{
  for(const alteration of ['frameCount','delayMs']) {
    const {pipeline}=await fixture();await pipeline.interpolate();
    const report=await pipeline.readJson('interpolation.json');if(alteration==='frameCount')report.frameCount=3;else report.delayMs[0]++;
    const bytes=Buffer.from(JSON.stringify(report));await writeFile(await pipeline.output('interpolation.json'),bytes);
    pipeline.state.stages.interpolate.artifacts.find(a=>a.file==='interpolation.json').sha256=sha256(bytes);
    await pipeline.persistState();await assert.rejects(pipeline.check(),/interpolation_report_manifest_mismatch/);
  }
});
test('a matching forged browser receipt cannot bypass pause or source provenance gates during package',async()=>{
  const {pipeline,repoRoot}=await fixture();await pipeline.interpolate();await pipeline.check();
  const report=await pipeline.readJson('interpolation.json');
  const scopes={manifestScopeSha256:pipeline.manifestScopeSha256,keyScopeSha256:pipeline.keyScopeSha256,frameScopeSha256:report.frameScopeSha256};
  const forged={status:'PASSED_PLAYBACK_ONLY',technicalStatus:'PASSED_TECHNICAL_ONLY',...scopes,
    sourcePngSha256:await Promise.all(Array.from({length:5},async(_,i)=>sha256(await readFile(await pipeline.output('frames/'+String(i).padStart(3,'0')+'.png'))))),
    modes:[1,.5].map(speed=>({speed,framesVisited:5,cycles:1,sourcePngHashesVerified:5,pixelMismatchFrames:[]})),
    paused:false,reducedMotionPaused:true,mobileOverflow:false,errors:[],externalRequests:[],releaseAllowed:false};
  const artifact=await pipeline.json('playback.json',forged);pipeline.mark('preview',[artifact],{frameScopeSha256:report.frameScopeSha256});await pipeline.persistState();
  await writeFile(resolve(repoRoot,'final-approval.json'),JSON.stringify({schemaVersion:1,reviewer:'Synthetic fixture only',reviewedAt:'2026-10-05T09:00:00Z',scopeSha256:report.frameScopeSha256,status:'APPROVED_FOR_RELEASE',releaseAllowed:true,...scopes}));
  await assert.rejects(pipeline.package());
  assert.equal(await pipeline.receiptValid('package'),false);
});
test('real offline browser and WebP package roundtrip require a separate complete-frame art decision',
  {skip:process.env.ANIMATION_BROWSER_TEST!=='1'},async()=>{
  const {pipeline,repoRoot}=await fixture();await pipeline.interpolate();await pipeline.check();
  const browser=await pipeline.preview();assert.equal(browser.status,'PASSED_PLAYBACK_ONLY');
  assert.deepEqual(browser.modes.map(m=>m.framesVisited),[5,5]);assert.ok(browser.modes.every(m=>!m.pixelMismatchFrames.length));
  await assert.rejects(pipeline.package());
  const report=await pipeline.readJson('interpolation.json');
  const scopes={manifestScopeSha256:pipeline.manifestScopeSha256,keyScopeSha256:pipeline.keyScopeSha256,frameScopeSha256:report.frameScopeSha256};
  await writeFile(resolve(repoRoot,'final-approval.json'),JSON.stringify({schemaVersion:1,reviewer:'Unit synthetic geometry only',reviewedAt:'2026-10-05T09:00:00Z',
    scopeSha256:report.frameScopeSha256,status:'APPROVED_FOR_RELEASE',releaseAllowed:true,...scopes}));
  await pipeline.package();const bundle=await pipeline.readJson('release/package.json');
  assert.equal(bundle.deployAllowed,false);assert.equal(bundle.retainedPngCount,5);assert.equal(bundle.encodedFrameCount,3);
});
