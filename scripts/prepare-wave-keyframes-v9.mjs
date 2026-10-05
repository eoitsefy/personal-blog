// Explicit source-key preparation only. Art approval is a separate human/agent review.
import sharp from 'sharp';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, out as v8, S, neutralPath, register, bake, readPixels, hash, interpolationEditable, editable } from './animation/wave-v8.mjs';

const out = resolve(root, 'docs/assistant/wave-keyframes-v9');
const specs = [
  { id: 'bridge', file: '02-bridge.png', hand: [276,438,55,48] },
  { id: 'half', file: '04-half.png', hand: [256,393,57,53] },
];
const reuse = [['00-neutral.png','00-neutral.png'],['01-prep.png','01-prep.png'],['02-middle.png','03-middle.png'],['03-opening.png','05-opening.png'],['04-peak.png','06-peak.png']];
// Versioned sources must not silently overwrite a previously reviewed result.
try {
  const reviewed=JSON.parse(await readFile(resolve(out,'review/automatic.json'),'utf8'));
  if(reviewed.status!=='PENDING_KEY_ART_REVIEW')throw Error('v9_already_reviewed_use_new_version');
  try { await readFile(resolve(out,'review/key-approval.json')); throw Error('v9_already_reviewed_use_new_version'); }
  catch(error){if(error.code!=='ENOENT')throw error;}
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await Promise.all(['keys','registered','review'].map(name => mkdir(resolve(out,name),{recursive:true})));
const neutral = (await readPixels(neutralPath)).data;
const v9Editable=(x,y)=>editable(x,y,neutral)&&(interpolationEditable(x,y,neutral)||specs.some(({hand:[hx,hy,hw,hh]})=>x>=hx&&x<hx+hw&&y>=hy&&y<hy+hh));
for (const [from,to] of reuse) await copyFile(resolve(v8,'keys',from),resolve(out,'keys',to));
const poses = [];
for (const spec of specs) {
  const source=resolve(out,'generated',spec.id+'.png'), reg=await register(source);
  await sharp(reg.data,{raw:{width:S,height:S,channels:4}}).png().toFile(resolve(out,'registered',spec.id+'.png'));
  const data=bake(reg.data,neutral,spec.hand);
  let changedStatic=0,opaqueSkin=0,translucentSkin=0,sumX=0,sumY=0;
  for(let y=0;y<S;y++)for(let x=0;x<S;x++) {
    const p=(y*S+x)*4, a=data[p+3];
    if(!v9Editable(x,y)&&!data.subarray(p,p+4).equals(neutral.subarray(p,p+4)))changedStatic++;
    const [hx,hy,hw,hh]=spec.hand;
    if(x>=hx&&x<hx+hw&&y>=hy&&y<hy+hh&&a>=20&&data[p]>160&&data[p]>data[p+1]+8&&data[p+1]>data[p+2]+8) {
      if(a>=245){opaqueSkin++;sumX+=x;sumY+=y;}else translucentSkin++;
    }
  }
  await sharp(data,{raw:{width:S,height:S,channels:4}}).png().toFile(resolve(out,'keys',spec.file));
  poses.push({id:spec.id,file:spec.file,sourceSha256:hash(await readFile(source)),rgbaSha256:hash(data),registration:reg.shift,opaqueSkin,translucentSkin,
    skinTranslucentRatio:translucentSkin/Math.max(1,opaqueSkin+translucentSkin),handCentre:[sumX/Math.max(1,opaqueSkin),sumY/Math.max(1,opaqueSkin)],changedStatic});
}
const keyFiles=['00-neutral.png','01-prep.png','02-bridge.png','03-middle.png','04-half.png','05-opening.png','06-peak.png'];
const rgbaHashes=[];
for(const file of keyFiles)rgbaHashes.push(hash((await readPixels(resolve(out,'keys',file))).data));
const mask=Buffer.alloc(S*S*4);
for(let y=0;y<S;y++)for(let x=0;x<S;x++)if(v9Editable(x,y))mask.fill(255,(y*S+x)*4,(y*S+x)*4+4);
await sharp(mask,{raw:{width:S,height:S,channels:4}}).png().toFile(resolve(out,'editable-mask.png'));
for(const theme of ['light','dark'])for(const detail of [false,true]) {
  const crop=detail?{left:208,top:342,width:145,height:189}:{left:176,top:144,width:416,height:512};
  const w=detail?218:208,h=detail?284:256,background=theme==='light'?'#f4f1e9':'#181e25';
  const tiles=await Promise.all(keyFiles.map(async(file,i)=>({input:await sharp(resolve(out,'keys',file)).extract(crop).resize(w,h).png().toBuffer(),left:i*w,top:0})));
  await sharp({create:{width:w*keyFiles.length,height:h,channels:4,background}}).composite(tiles).png().toFile(resolve(out,'review',`${detail?'arm':'keys'}-${theme}.png`));
}
const report={version:1,status:'PENDING_KEY_ART_REVIEW',releaseAllowed:false,productionChanged:false,canvas:S,keyFiles,keyRgbaSha256:rgbaHashes,
  keyOnlyScopeSha256:hash(Buffer.from(rgbaHashes.join(''))),poses,newIndependentDrawings:2,reusedIndependentDrawings:5,generatedOutputs:4,rejectedGeneratedOutputs:2,
  note:'Actual motion is raise-hand greeting and return, not a side-to-side wrist-wave cycle.'};
await writeFile(resolve(out,'review/automatic.json'),JSON.stringify(report,null,2)+'\n');
const relativeBase='docs/assistant/wave-keyframes-v9';
const bound=async file=>({file,sha256:hash(await readFile(resolve(root,file)))});
const ids=['neutral','prep','bridge','middle','half','opening','peak'];
const manifest={schemaVersion:1,id:'wave-v9',action:'wave',reference:await bound('docs/assistant/wave-keyframes-v8/reference/neutral-clean.png'),
  editableMask:await bound(relativeBase+'/editable-mask.png'),keys:await Promise.all(keyFiles.map(async(file,i)=>({id:ids[i],...await bound(relativeBase+'/keys/'+file)}))),
  canvas:{width:S,height:S,safetyInset:.2},motion:{sequence:[...ids,...ids.slice(0,-1).reverse()],stepsPerInterval:3,fps:15,loopDurationMs:3000},
  interpolation:{method:'rife-rgba',gpu:1},review:{keyApproval:relativeBase+'/review/key-approval.json',finalApproval:relativeBase+'/review/final-approval.json'}};
await writeFile(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
