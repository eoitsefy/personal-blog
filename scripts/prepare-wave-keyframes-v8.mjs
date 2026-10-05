// Whole-frame offline authoring; never imported by the public renderer.
import sharp from 'sharp';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root,out,S,SCALE,neutralPath,specs,keyFiles,readPixels,register,bake,editable,hash } from './animation/wave-v8.mjs';
await Promise.all(['keys','registered','review'].map(name=>mkdir(resolve(out,name),{recursive:true})));
const neutral=(await readPixels(neutralPath)).data;
const report={status:'PENDING_VISUAL_REVIEW',releaseAllowed:false,interpolationAllowed:false,sharedScale:SCALE,newGeneratedPoses:3,reusedMiddle:true,
  canvas:{width:S,height:S,safetyInset:.2,anchor:{x:384,y:608}},neutralRgbaSha256:hash(neutral),poses:[]};
await copyFile(neutralPath,resolve(out,'keys/00-neutral.png'));
await copyFile(resolve(root,'docs/assistant/wave-keyframes-v7/keys/02-middle.png'),resolve(out,'keys/02-middle.png'));
for (const spec of specs) {
  const source=resolve(out,'generated',spec.name+'.png'),reg=await register(source);
  await sharp(reg.data,{raw:{width:S,height:S,channels:4}}).png().toFile(resolve(out,'registered',spec.name+'.png'));
  if (process.argv.includes('--register-only')) {console.log(JSON.stringify({name:spec.name,anchor:reg.anchor,shift:reg.shift}));continue;}
  const frame=bake(reg.data,neutral,spec.hand), [hx,hy,hw,hh]=spec.hand;
  let l=S,t=S,r=-1,b=-1,staticChanges=0,skinOpaque=0,skinTranslucent=0,headSkinOverlap=0;
  for(let y=0;y<S;y++) for(let x=0;x<S;x++) {
    const p=(y*S+x)*4;
    if (!editable(x,y,neutral) && frame.subarray(p,p+4).compare(neutral.subarray(p,p+4))) staticChanges++;
    if (frame[p+3]>=8) {l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
    if(x>=hx&&x<hx+hw&&y>=hy&&y<hy+hh) {
      const skin=d=>d[p]>160&&d[p]>d[p+1]+8&&d[p+1]>d[p+2]+8;
      if(frame[p+3]>=20&&skin(frame)) {if(frame[p+3]>=245) skinOpaque++;else skinTranslucent++;}
      if(y<400&&neutral[p+3]>=100&&reg.data[p+3]>=200&&skin(reg.data)) headSkinOverlap++;
    }
  }
  const safeMargins=[l,t,S-1-r,S-1-b].every(v=>v>=Math.ceil(S*.2));
  const skinTranslucentRatio=skinTranslucent/Math.max(1,skinOpaque+skinTranslucent);
  await sharp(frame,{raw:{width:S,height:S,channels:4}}).png().toFile(resolve(out,'keys',spec.file));
  report.poses.push({name:spec.name,file:spec.file,sourceSha256:hash(await readFile(source)),rgbaSha256:hash(frame),anchor:reg.anchor,shift:reg.shift,handInspectionBox:spec.hand,
    staticChanges,bounds:[l,t,r,b],safeMargins,skinOpaque,skinTranslucent,skinTranslucentRatio,headSkinOverlap,
    passed:staticChanges===0&&safeMargins&&skinOpaque>50&&skinTranslucentRatio<.05&&headSkinOverlap===0});
}
if (!process.argv.includes('--register-only')) {
  const hashes=[];
  for(const file of keyFiles) hashes.push(hash((await readPixels(resolve(out,'keys',file))).data));
  report.keyRgbaSha256=hashes;
  report.artScopeSha256=hash(Buffer.from(hashes.join('')));
  if(report.poses.some(p=>!p.passed))report.status='REJECTED_TECHNICAL';
  for(const theme of ['light','dark']) {
    const background=theme==='light'?'#f4f1e9':'#181e25';
    for(const detail of [false,true]) {
      const crop=detail?{left:208,top:342,width:145,height:189}:{left:176,top:144,width:416,height:512};
      const width=detail?290:333,height=detail?378:410;
      const tiles=await Promise.all(keyFiles.map(async(file,i)=>({input:await sharp(resolve(out,'keys',file)).extract(crop).resize(width,height).png().toBuffer(),left:i*width,top:0})));
      await sharp({create:{width:width*keyFiles.length,height,channels:4,background}}).composite(tiles).png().toFile(resolve(out,'review',`${detail?'arm':'keys'}-${theme}.png`));
    }
  }
  await writeFile(resolve(out,'review/automatic.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  if(report.status==='REJECTED_TECHNICAL')process.exitCode=1;
}
