// Non-destructive raster finishing of actual Cubism exports. Never rewrites
// the native model or declares its rejected intermediate eyelids approved.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
function pointInside(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const[xi,yi]=points[i],[xj,yj]=points[j];if(((yi>y)!==(yj>y))&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}return inside;}
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const release=resolve(root,'docs/assistant/left-collar-release-v1');
const output=resolve(root,'docs/assistant/left-collar-v4');
const native=resolve(root,'docs/assistant/live2d-badge-v7/render/breath-blink');
const hash=x=>createHash('sha256').update(x).digest('hex');
async function retain(path,bytes){await mkdir(dirname(path),{recursive:true});
  try{assert.ok((await readFile(path)).equals(bytes),`Version conflict: ${path}`);}
  catch(e){if(e.code!=='ENOENT')throw e;await writeFile(path,bytes,{flag:'wx'});}}
const rgba=bytes=>sharp(bytes).ensureAlpha().raw().toBuffer();
const rawPng=(pixels,w,h)=>sharp(pixels,{raw:{width:w,height:h,channels:4}}).png().toBuffer();
const rect={left:180,top:153,width:366,height:460};
const scale=.553763440860215/1.2;
const original=await readFile(resolve(release,'source/original-neutral.png'));
assert.equal(hash(original),'5a12d3aec74704c6ae4360159e1cdcda98fc35b6b43abeccc06cf4d87765bbe0');
const open=await rgba(original);
const skinBytes=await readFile(resolve(release,'source/skin-backfill.png'));
assert.equal(hash(skinBytes),'dac1ec262fab64daccb3d1c1fc804359b46354f72b4e71e1131b38b38732a76c');
const skin=await sharp(skinBytes).resize(768,768).ensureAlpha().raw().toBuffer();
const badgeBytes=await readFile(resolve(release,'source/nameplate-left.png'));
const smooth=x=>x*x*(3-2*x);
const eyes=[{polygon:[[308,334],[313,321],[325,312],[352,313],[371,330],[373,354],[365,364],[338,368],[312,352]]},
  {polygon:[[394,326],[400,311],[413,303],[438,303],[456,319],[458,348],[448,356],[425,362],[398,346]]}];
export function blinkClosure(frame){
  if(frame<=36||frame>=49)return 0;
  if(frame<=41)return smooth((frame-36)/5);
  if(frame<=43)return 1;
  return 1-smooth((frame-43)/6);
}
// One controlled upper-lid curve per eye. Endpoints follow the original upper
// contour down to the closed arc; the iris stays fixed, never squeezed/warped.
const lids=[{x0:317,x1:363,open:[336,321,318,336],closed:[350,358,358,348]},
  {x0:403,x1:450,open:[322,307,307,324],closed:[343,350,348,340]}];
function cubic(v,t){return (1-t)**3*v[0]+3*(1-t)**2*t*v[1]+3*(1-t)*t*t*v[2]+t**3*v[3];}
async function finishEye(pixels,closure){
  const linePaths=[];
  for(const [index,eye]of eyes.entries()){
    const lid=lids[index],v=lid.open.map((n,i)=>n+(lid.closed[i]-n)*closure);
    for(let y=300;y<369;y++)for(let x=305;x<460;x++)if(pointInside(x+.5,y+.5,eye.polygon)){
      const n=(y*768+x)*4;
      // Restore exact neutral pixels before masking. This removes every native
      // lash duplicate and mask seam without touching brows, hair or face shape.
      open.copy(pixels,n,n,n+4);
      if(closure>0){const t=Math.max(0,Math.min(1,(x+.5-lid.x0)/(lid.x1-lid.x0)));
        const edge=cubic(v,t),stroke=7-closure*3.5,cover=Math.max(0,Math.min(1,edge+stroke*.5-y+.5));
        for(let c=0;c<3;c++)pixels[n+c]=Math.round(open[n+c]*(1-cover)+skin[n+c]*cover);
      }
    }
    if(closure>0)linePaths.push(`<path d="M${lid.x0} ${v[0]} C${lid.x0+18} ${v[1]} ${lid.x1-18} ${v[2]} ${lid.x1} ${v[3]}"/>`);
  }
  if(!closure)return pixels;
  const svg=Buffer.from(`<svg width="768" height="768"><g fill="none" stroke="#241b19" stroke-width="${7-closure*3.5}" stroke-linecap="round">${linePaths.join('')}</g></svg>`);
  const composed=await sharp(pixels,{raw:{width:768,height:768,channels:4}}).composite([{input:svg}]).raw().toBuffer();
  // Limit all finish edits to the original eye apertures, including AA strokes.
  for(let y=0;y<768;y++)for(let x=0;x<768;x++)if(!eyes.some(e=>pointInside(x+.5,y+.5,e.polygon))){const n=(y*768+x)*4;pixels.copy(composed,n,n,n+4);}
  return composed;
}
const frames=[],sourceHashes=[],frameHashes=[],review=[];
for(let i=0;i<=120;i++){
  const bytes=await readFile(resolve(native,`Idle_BreathBlink_4s_${String(i).padStart(3,'0')}.png`));sourceHashes.push(hash(bytes));
  const center=await sharp(bytes).extract({left:256,top:0,width:768,height:720}).png().toBuffer();
  const pixels=await sharp({create:{width:768,height:768,channels:4,background:'#0000'}}).composite([{input:center,left:0,top:24}]).raw().toBuffer();
  const closure=blinkClosure(i),finished=await finishEye(pixels,closure);
  const png=await rawPng(finished,768,768);frameHashes.push(hash(png));
  await retain(resolve(output,`frames/idle/${String(i).padStart(3,'0')}.png`),png);
  frames.push(png);
  if(i>=34&&i<=51)review.push({i,png});
}
assert.equal(frameHashes[0],frameHashes[120]);
for(const[theme,background]of[['light','#f7f4eb'],['dark','#171b21']]){
  const cells=[];for(const[j,{i,png}]of review.entries()){
    cells.push({input:await sharp(png).extract({left:300,top:294,width:165,height:75}).resize(330,150,{kernel:'nearest'}).flatten({background}).png().toBuffer(),left:j%6*330,top:Math.floor(j/6)*174+24});
    cells.push({input:Buffer.from(`<svg width="330" height="24"><text x="8" y="18" fill="#ba901c">Frame ${i}</text></svg>`),left:j%6*330,top:Math.floor(j/6)*174});
  }await retain(resolve(output,`review/eyes-${theme}.png`),await sharp({create:{width:1980,height:522,channels:4,background}}).composite(cells).png().toBuffer());
}
// Draft only: publication is a distinct step after visual review of these files.
await retain(resolve(output,'candidate.json'),Buffer.from(JSON.stringify({version:4,nativeVersion:7,nativeIntermediateArt:'REJECTED_RETAINED',method:'Actual native torso + deterministic eye-aperture contour finish; original irises unwarped',eyeFinishPolygons:eyes.map(e=>e.polygon),sourceHashes,frameHashes,loopEndpointEqual:true,rect,scale,badgeSha256:hash(badgeBytes),artReview:'AWAITING_REVIEW',deployAllowed:false},null,2)+'\n'));
console.log(JSON.stringify({output,frames:frames.length,eyeReview:resolve(output,'review/eyes-light.png')}));
