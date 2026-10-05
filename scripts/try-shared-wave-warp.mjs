// Offline diagnostic candidate only. Does not write an art approval or public asset.
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AnimationPipeline,sha256 } from './animation/pipeline.mjs';
import { warpBetween } from './animation/shared-warp.mjs';
import { contactSheets } from './animation/contact-sheet.mjs';
const manifest=resolve('docs/assistant/wave-keyframes-v9/manifest.json');
const pipeline=await AnimationPipeline.load(manifest);await pipeline.keyApproval();
const fixed=[[218,345],[345,345],[218,526],[345,526],[337,400],[337,450],[337,510],[328,417]];
const moving=[
  [[308,511],[309,502],[307,472]], [[308,488],[309,477],[295,465]], [[312,462],[311,451],[295,445]],
  [[295,430],[301,443],[311,454]], [[288,410],[296,429],[309,444]], [[274,400],[285,420],[301,440]], [[264,378],[280,399],[298,431]],
];
const landmarks=moving.map(points=>[...fixed,...points]);
const warpHash=sha256(await readFile(resolve('scripts/animation/shared-warp.mjs')));
const candidateScope=sha256(Buffer.from(JSON.stringify({keys:pipeline.keyScopeSha256,landmarks,warpHash})));
pipeline.outputRoot=resolve(pipeline.toolRoot,'jobs/shared-warp-v9',candidateScope);
await pipeline.resourceGate();
const ids=new Map(pipeline.manifest.keys.map((k,i)=>[k.id,i])),sequence=pipeline.manifest.motion.sequence.map(id=>ids.get(id));
const frames=[],measures=[],steps=3;
for(let segment=0;segment<sequence.length-1;segment++)for(let step=0;step<steps;step++) {
  const a=sequence[segment],b=sequence[segment+1];
  const data=warpBetween(pipeline.keys[a],pipeline.keys[b],pipeline.mask,768,768,landmarks[a],landmarks[b],step/steps);
  measures.push(pipeline.measure(data,frames.length));
  frames.push(await pipeline.output('frames/'+String(frames.length).padStart(3,'0')+'.png'));
  await pipeline.immutable('frames/'+String(frames.length-1).padStart(3,'0')+'.png',await sharp(data,{raw:{width:768,height:768,channels:4}}).png().toBuffer());
}
const final=pipeline.keys[0];measures.push(pipeline.measure(final,frames.length));
frames.push(await pipeline.output('frames/'+String(frames.length).padStart(3,'0')+'.png'));
await pipeline.immutable('frames/'+String(frames.length-1).padStart(3,'0')+'.png',await sharp(final,{raw:{width:768,height:768,channels:4}}).png().toBuffer());
const report={candidateScope,warpHash,sourceKeyScopeSha256:pipeline.keyScopeSha256,landmarks,frames:measures,frameScopeSha256:sha256(Buffer.from(measures.map(m=>m.rgbaSha256).join(''))),
  status:measures.every(m=>m.passed)?'PENDING_ART_REVIEW':'REJECTED_TECHNICAL',releaseAllowed:false,productionChanged:false,paidRequests:0,
  method:'Offline full-PNG inverse TPS shared RGBA map; premultiplied sampling, no alpha clamping',fps:15,frameCount:37};
await pipeline.json('technical.json',report);
await contactSheets(frames,pipeline.manifest.canvas,await pipeline.output('contact'),{left:208,top:342,width:145,height:189});
console.log(JSON.stringify({outputRoot:pipeline.outputRoot,status:report.status,scope:report.frameScopeSha256,failed:measures.filter(m=>!m.passed).map(m=>m.index)},null,2));
