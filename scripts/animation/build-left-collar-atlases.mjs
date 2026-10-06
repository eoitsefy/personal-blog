import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {REGISTERED_SHEETS} from '../../src/lib/assistant/registered-sheets.ts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),pack=resolve(root,'docs/assistant/left-collar-release-v1');
const sourcePack=pack;
const hash=x=>createHash('sha256').update(x).digest('hex');
function equalVisible(a,b){assert.equal(a.length,b.length);for(let i=0;i<a.length;i+=4){assert.equal(a[i+3],b[i+3]);if(b[i+3])assert.ok(a.subarray(i,i+3).equals(b.subarray(i,i+3)));}}
async function retain(path,bytes){await mkdir(dirname(path),{recursive:true});try{assert.ok((await readFile(path)).equals(bytes),`Version conflict ${path}`);}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(path,bytes,{flag:'wx'});}}
const candidate=JSON.parse(await readFile(resolve(sourcePack,'source-candidate.json'),'utf8'));
const rect=candidate.rect,scale=candidate.scale;
const badge=await sharp(resolve(pack,'source/nameplate-left.png')).extract({left:430,top:407,width:13,height:37}).png().toBuffer();
const assets={},contacts={};
const indices=[...new Set([...Array.from({length:61},(_,i)=>i*2),37,39,41,43,45,47])].sort((a,b)=>a-b);
const idle=[];
for(const index of indices){const png=await readFile(resolve(sourcePack,`frames/idle/${String(index).padStart(3,'0')}.png`));assert.equal(hash(png),candidate.frameHashes[index]);idle.push(await sharp(png).extract(rect).ensureAlpha().raw().toBuffer());}
const cols=6,w=rect.width*cols,h=rect.height*Math.ceil(idle.length/cols),atlas=Buffer.alloc(w*h*4);
for(const[i,pixels]of idle.entries())for(let y=0;y<rect.height;y++)pixels.copy(atlas,((Math.floor(i/cols)*rect.height+y)*w+i%cols*rect.width)*4,y*rect.width*4,(y+1)*rect.width*4);
const idleBytes=await sharp(atlas,{raw:{width:w,height:h,channels:4}}).webp({lossless:true,effort:6}).toBuffer();
equalVisible(await sharp(idleBytes).ensureAlpha().raw().toBuffer(),atlas);
await retain(resolve(root,'public/assistant/chibi-idle-left-collar-v4.webp'),idleBytes);
assets['pilot-blink']={src:'/assistant/chibi-idle-left-collar-v4.webp',width:w,height:h,columns:cols,frames:idle.length,sourceIndices:indices,scale,sha256:hash(idleBytes),bytes:idleBytes.length};
contacts.idle=idle;
const sheets={...REGISTERED_SHEETS,'pilot-wave':{src:'/assistant/chibi-wave-reviewed-v16.webp',width:2196,height:3220,scale,poses:Array.from({length:37},(_,i)=>{const x=i%6*366,y=Math.floor(i/6)*460;return[x,y,x+365,y+459,x+204,y+455];})}};
const selected=['pilot-wave','nod','thinking','thinking-recovery','bow','cheer','yawn','yawn-recovery'];
// Reviewed pose-space collar tracking. Never infer a collar from brightness:
// a lowered face and the white undershirt can otherwise swap the track target.
const collarY={
  nod:[0,1,2,4,6,8,10,8,6,4,2,0],
  bow:[0,2,6,9,13,19,28,35,43,46,40,33,25,16,10,5,2,0],
  thinking:[0,0,0,0,0,1,1,2,3,3,3,3,3,2],
  'thinking-recovery':[2,2,2,1,1,1,1,0,0,0,0,0],
  yawn:[0,0,0,0,1,2,3,4,5,6,6,6,6,6,6,6,5,4,3,2],
  'yawn-recovery':[2,2,1,1,1,0,0,0,0,0,0,0],
};
for(const key of selected){
  const sheet=sheets[key],bytes=await readFile(resolve(root,'public'+sheet.src)),original=await sharp(bytes).ensureAlpha().raw().toBuffer();let patched=Buffer.from(original);const placements=[];
  for(const[index,[x,y,right,bottom,anchorX,anchorY]]of sheet.poses.entries()){
    const ratio=scale/sheet.scale,bw=Math.max(1,Math.round(13*ratio)),bh=Math.max(1,Math.round(37*ratio));
    const dy=(collarY[key]?.[index]??0)*ratio;
    const left=Math.round(anchorX+46*ratio),top=Math.round(anchorY-201*ratio+dy);
    assert.ok(left>x&&top>y&&left+bw<right&&top+bh<bottom,'Badge outside pose crop');
    const small=await sharp(badge).resize(bw,bh).png().toBuffer();
    const patch=await sharp(original,{raw:{width:sheet.width,height:sheet.height,channels:4}}).extract({left,top,width:bw,height:bh}).composite([{input:small}]).raw().toBuffer();
    for(let py=0;py<bh;py++)patch.copy(patched,((top+py)*sheet.width+left)*4,py*bw*4,(py+1)*bw*4);
    placements.push({index,left,top,width:bw,height:bh,necklineShift:dy});
  }
  const out=await sharp(patched,{raw:{width:sheet.width,height:sheet.height,channels:4}}).webp({lossless:true,effort:6}).toBuffer();
  const name=`/assistant/chibi-${key}-left-collar-v5.webp`;await retain(resolve(root,'public'+name),out);
  equalVisible(await sharp(out).ensureAlpha().raw().toBuffer(),patched);
  assets[key]={src:name,width:sheet.width,height:sheet.height,scale:sheet.scale,frames:sheet.poses.length,bytes:out.length,sha256:hash(out),sourceSrc:sheet.src,sourceSha256:hash(bytes),placements};
  const crops=[];for(const[x,y,right,bottom]of sheet.poses)crops.push(await sharp(out).extract({left:x,top:y,width:right-x+1,height:bottom-y+1}).resize(224,224,{fit:'contain',background:'#0000'}).png().toBuffer());contacts[key]=crops;
}
const fallback=await sharp(await readFile(resolve(sourcePack,'frames/idle/000.png'))).png().toBuffer();
await retain(resolve(root,'public/assistant/chibi-neutral-left-collar-v4.png'),fallback);assets.fallback={src:'/assistant/chibi-neutral-left-collar-v4.png',sha256:hash(fallback),bytes:fallback.length};
for(const[theme,background]of[['light','#f7f4eb'],['dark','#171b21']])for(const[key,frames]of Object.entries(contacts)){
  const cells=[];for(const[i,frame]of frames.entries()){const png=Buffer.isBuffer(frame)&&key==='idle'?await sharp(frame,{raw:{width:366,height:460,channels:4}}).resize(224,224,{fit:'contain',background:'#0000'}).png().toBuffer():frame;
    cells.push({input:await sharp(png).flatten({background}).png().toBuffer(),left:i%8*224,top:Math.floor(i/8)*248+24});
    cells.push({input:Buffer.from(`<svg width="224" height="24"><text x="8" y="18" fill="#ba901c">${key} ${i}</text></svg>`),left:i%8*224,top:Math.floor(i/8)*248});}
  await retain(resolve(pack,`review/${key}-${theme}.png`),await sharp({create:{width:1792,height:Math.ceil(frames.length/8)*248,channels:4,background}}).composite(cells).png().toBuffer());
}
await retain(resolve(pack,'atlas-candidate.json'),Buffer.from(JSON.stringify({version:1,status:'AWAITING_VISUAL_AND_BROWSER_REVIEW',assets,idleTimes:indices.map(i=>Math.min(i,119)*1000/30),nativeSourceScopeSha256:hash(candidate.sourceHashes.join('')),finishedScopeSha256:hash(candidate.frameHashes.join('')),productionChanged:false},null,2)+'\n'));
console.log(JSON.stringify({assets:Object.values(assets).map(a=>({src:a.src,bytes:a.bytes})),idleFrames:indices.length}));
