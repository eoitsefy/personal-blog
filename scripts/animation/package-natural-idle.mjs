import sharp from 'sharp';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
const source=resolve(process.argv[2]??'docs/assistant/live2d-restart-v1/review/idle-contour-study-v2-natural-hands');
const out=resolve('public/assistant'), docs=resolve('docs/assistant/natural-idle-v2');
await mkdir(out,{recursive:true}); await mkdir(docs,{recursive:true});
const count=120,size=480,stack=Buffer.alloc(size*size*4*count);
for(let i=0;i<count;i++){
  const raw=await sharp(join(source,'frames',`idle_${String(i).padStart(3,'0')}.png`)).resize(size,size).ensureAlpha().raw().toBuffer();
  raw.copy(stack,i*size*size*4);
}
const animated=join(out,'chibi-natural-idle-v2.webp'),still=join(out,'chibi-natural-idle-v2-still.webp');
await sharp(stack,{raw:{width:size,height:size*count,channels:4,pageHeight:size},limitInputPixels:false}).webp({quality:90,alphaQuality:100,effort:6,loop:0,delay:Array.from({length:count},(_,i)=>i%3===2?34:33)}).toFile(animated);
await sharp(join(source,'frames/idle_000.png')).resize(size,size).webp({lossless:true}).toFile(still);
const metadata=await sharp(animated,{animated:true}).metadata();
assert.equal(metadata.pages,count);assert.equal(metadata.delay.reduce((a,b)=>a+b,0),4000);assert(metadata.hasAlpha);
const sha=b=>createHash('sha256').update(b).digest('hex');
const assets=[];for(const path of [animated,still]){const b=await readFile(path);assets.push({src:'/assistant/'+path.split(/[\\/]/).pop(),bytes:b.length,sha256:sha(b)});}
await writeFile(join(docs,'manifest.json'),JSON.stringify({version:'natural-idle-v2',fps:30,durationMs:4000,frames:count,width:size,height:size,assets,sourceReportSha256:sha(await readFile(join(source,'report.json'))),ownerAccepted:true,legacyAssetsRetained:true,encoding:{quality:90,alphaQuality:100,geometryChange:false}},null,2)+'\n');
console.log(JSON.stringify({assets,frames:metadata.pages,duration:4000}));
