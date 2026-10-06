import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {BLINK_INDICES,EYE_POLYGONS,refineEye,closureAt,lineStyle} from './blink-refinement.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),parent=resolve(root,'docs/assistant/left-collar-release-v1');
const slug=process.argv[2]||'blink-refinement-draft-v1';assert.match(slug,/^blink-refinement-(draft-v[1-9][0-9]*|v1)$/);
const pack=resolve(root,'docs/assistant',slug),hash=v=>createHash('sha256').update(v).digest('hex');
async function retain(path,bytes){await mkdir(dirname(path),{recursive:true});try{assert.ok((await readFile(path)).equals(bytes),'Immutable artifact changed: '+path);}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(path,bytes,{flag:'wx'});}}
const pm=JSON.parse(await readFile(resolve(parent,'atlas-candidate.json'),'utf8')),pc=JSON.parse(await readFile(resolve(parent,'source-candidate.json'),'utf8'));
const original=await readFile(resolve(parent,'source/original-neutral.png')),skinBytes=await readFile(resolve(parent,'source/skin-backfill.png'));
assert.equal(hash(original),'5a12d3aec74704c6ae4360159e1cdcda98fc35b6b43abeccc06cf4d87765bbe0');assert.equal(hash(skinBytes),'dac1ec262fab64daccb3d1c1fc804359b46354f72b4e71e1131b38b38732a76c');
const open=await sharp(original).ensureAlpha().raw().toBuffer(),skin=await sharp(skinBytes).resize(768,768).ensureAlpha().raw().toBuffer(),frames=[],eyeCrops=[];
const width=2196,height=5520,rect=pc.rect,atlas=Buffer.alloc(width*height*4);
for(const[index,frame]of BLINK_INDICES.entries()){
  const filename=String(frame).padStart(3,'0')+'.png';
  let sourcePath=`docs/assistant/left-collar-release-v1/frames/idle/${filename}`,source;
  if(frame===49){sourcePath=`docs/assistant/${slug}/source/049.png`;try{source=await readFile(resolve(root,sourcePath));}catch(e){if(e.code!=='ENOENT')throw e;source=await readFile(resolve(root,'docs/assistant/left-collar-v4/frames/idle/049.png'));await retain(resolve(root,sourcePath),source);}}
  else source=await readFile(resolve(root,sourcePath));
  assert.equal(hash(source),pc.frameHashes[frame]);
  const before=await sharp(source).ensureAlpha().raw().toBuffer(),after=await refineEye(before,open,skin,frame);
  let outputPath=sourcePath,bytes=source;
  if(closureAt(frame)>0){outputPath=`docs/assistant/${slug}/frames/${filename}`;bytes=await sharp(after,{raw:{width:768,height:768,channels:4}}).png().toBuffer();await retain(resolve(root,outputPath),bytes);}
  frames.push({frame,sourcePath,sourceSha256:hash(source),outputPath,sha256:hash(bytes)});
  const crop=await sharp(bytes).extract(rect).ensureAlpha().raw().toBuffer();
  for(let y=0;y<rect.height;y++)crop.copy(atlas,((Math.floor(index/6)*460+y)*width+index%6*366)*4,y*366*4,(y+1)*366*4);
  if(frame>=34&&frame<=50)eyeCrops.push({frame,png:await sharp(bytes).extract({left:300,top:294,width:165,height:75}).resize(330,150).png().toBuffer()});
}
const webp=await sharp(atlas,{raw:{width,height,channels:4}}).webp({lossless:true,effort:6}).toBuffer();
const readback=await sharp(webp).ensureAlpha().raw().toBuffer();for(let n=0;n<atlas.length;n+=4){assert.equal(readback[n+3],atlas[n+3]);if(atlas[n+3])assert.ok(readback.subarray(n,n+3).equals(atlas.subarray(n,n+3)));}
await retain(resolve(pack,'idle.webp'),webp);
for(const[theme,bg]of[['light','#f7f4eb'],['dark','#171b21']]){
  const cells=[];for(const[i,x]of eyeCrops.entries()){cells.push({input:await sharp(x.png).flatten({background:bg}).png().toBuffer(),left:i%6*330,top:Math.floor(i/6)*174+24});cells.push({input:Buffer.from(`<svg width="330" height="24"><text x="8" y="18" fill="#ba901c">Frame ${x.frame}</text></svg>`),left:i%6*330,top:Math.floor(i/6)*174});}
  await retain(resolve(pack,`review/eyes-${theme}.png`),await sharp({create:{width:1980,height:Math.ceil(eyeCrops.length/6)*174,channels:4,background:bg}}).composite(cells).png().toBuffer());
}
const asset={src:'/assistant/chibi-idle-blink-refined-v1.webp',width,height,bytes:webp.length,sha256:hash(webp)};
const kept=Object.fromEntries(Object.entries(pm.assets).filter(([k])=>k!=='pilot-blink'));
// Text provenance uses canonical LF so Git's Windows checkout conversion does
// not change the provenance hash; binary art hashes always bind exact bytes.
const codeHash=async path=>hash((await readFile(path,'utf8')).replace(/\r\n/g,'\n'));
const manifest={version:1,status:'AWAITING_INDEPENDENT_REVIEW',parent:'left-collar-release-v1',asset,keptAssets:kept,frames,eyePolygons:EYE_POLYGONS,indices:BLINK_INDICES,times:BLINK_INDICES.map(i=>Math.min(i,119)*1000/30),rect,scale:pc.scale,frameScopeSha256:hash(frames.map(f=>f.sha256).join('')),generatorSha256:await codeHash(fileURLToPath(import.meta.url)),eyeModuleSha256:await codeHash(resolve(root,'scripts/animation/blink-refinement.mjs')),codeHashFormat:'UTF-8-LF',toolVersions:sharp.versions,lockfileSha256:await codeHash(resolve(root,'package-lock.json')),originalNeutralSha256:hash(original),skinBackfillSha256:hash(skinBytes),closedStyle:lineStyle(1),nativeRigReleased:false,deployAllowed:false};
manifest.assetScopeSha256=hash([asset,...Object.values(kept)].map(v=>v.src+':'+v.sha256).sort().join('\n'));
await retain(resolve(pack,'candidate.json'),Buffer.from(JSON.stringify(manifest,null,2)+'\n'));console.log(JSON.stringify({pack,asset,frameScopeSha256:manifest.frameScopeSha256,assetScopeSha256:manifest.assetScopeSha256}));
