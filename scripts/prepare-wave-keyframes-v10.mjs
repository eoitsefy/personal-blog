// Candidate assembly only: approvals are written separately after actual art review.
import sharp from 'sharp';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, S, neutralPath, register, bake, readPixels, hash, editable } from './animation/wave-v8.mjs';
import { contactSheets } from './animation/contact-sheet.mjs';
const out = resolve(root, 'docs/assistant/wave-keyframes-v10');
const base = 'docs/assistant/wave-keyframes-v10';
const parentScope = '21167c671bfbf29737b1c939bb50061890ddc612e66772b11c8514c71717dd68';
const selected = new Map([[1,'001'],[7,'007-new'],[8,'008-exact'],[14,'014'],[16,'016'],[17,'017']]);
const originalKeys = new Set([0,3,6,9,12,15,18]);
try { await readFile(resolve(out,'review/key-approval.json')); throw Error('reviewed_inputs_are_immutable_use_new_version'); }
catch(e) { if(e.code !== 'ENOENT') throw e; }
await Promise.all(['keys','frames','registered','review'].map(p=>mkdir(resolve(out,p),{recursive:true})));
const neutral = (await readPixels(neutralPath)).data;
const provenance = [], poses=[];
for(let i=0;i<19;i++) {
  const file=String(i).padStart(3,'0')+'.png', target=resolve(out,'keys',file), source=selected.get(i);
  let origin;
  if(source) {
    const generated=resolve(out,'generated',source+'.png'), reg=await register(generated);
    await sharp(reg.data,{raw:{width:S,height:S,channels:4}}).png().toFile(resolve(out,'registered',file));
    const data=bake(reg.data,neutral,[218,345,128,182]);
    await sharp(data,{raw:{width:S,height:S,channels:4}}).png().toFile(target);
    let changedStatic=0,skin=0,sx=0,sy=0;
    for(let y=0;y<S;y++)for(let x=0;x<S;x++) {
      const p=(y*S+x)*4;
      if(!editable(x,y,neutral)&&!data.subarray(p,p+4).equals(neutral.subarray(p,p+4)))changedStatic++;
      if(editable(x,y,neutral)&&data[p+3]>=245&&data[p]>160&&data[p]>data[p+1]+8&&data[p+1]>data[p+2]+8) {skin++;sx+=x;sy+=y;}
    }
    origin={kind:'image-edited-frame',parentFrameScopeSha256:parentScope,parentFrameIndex:i,editSourceSha256:hash(await readFile(generated))};
    poses.push({frame:i,source,registration:reg.shift,handCentre:[sx/skin,sy/skin],changedStatic});
  } else {
    await copyFile(resolve(root,'docs/assistant/wave-keyframes-v9/frames',file),target);
    origin=i===0?{kind:'reference'}:originalKeys.has(i)?{kind:'authored-keyframe'}:{kind:'interpolated-frame',parentFrameScopeSha256:parentScope,parentFrameIndex:i};
  }
  provenance.push({id:'pose-'+String(i).padStart(2,'0'),file:base+'/keys/'+file,sha256:hash(await readFile(target)),provenance:origin});
}
const frames=[];
for(let i=0;i<37;i++) {
  const forward=i<=18?i:36-i, file=String(i).padStart(3,'0')+'.png';
  await copyFile(resolve(out,'keys',String(forward).padStart(3,'0')+'.png'),resolve(out,'frames',file));
  frames.push((await readPixels(resolve(out,'frames',file))).data);
}
const mask=Buffer.alloc(S*S*4);
for(let y=0;y<S;y++)for(let x=0;x<S;x++)if(editable(x,y,neutral))mask.fill(255,(y*S+x)*4,(y*S+x)*4+4);
await sharp(mask,{raw:{width:S,height:S,channels:4}}).png().toFile(resolve(out,'editable-mask.png'));
await contactSheets(frames.map((_,i)=>resolve(out,'frames',String(i).padStart(3,'0')+'.png')),{width:S,height:S},resolve(out,'review'),{left:208,top:342,width:145,height:189});
const bound=async(file)=>({file,sha256:hash(await readFile(resolve(root,file)))});
const ids=provenance.map(k=>k.id);
const manifest={schemaVersion:1,id:'wave-v10',action:'wave',reference:await bound('docs/assistant/wave-keyframes-v8/reference/neutral-clean.png'),editableMask:await bound(base+'/editable-mask.png'),keys:provenance,canvas:{width:S,height:S,safetyInset:.2},motion:{sequence:[...ids,...ids.slice(0,-1).reverse()],stepsPerInterval:1,fps:15,loopDurationMs:3000},interpolation:{method:'hold',gpu:1},review:{keyApproval:base+'/review/key-approval.json',finalApproval:base+'/review/final-approval.json'}};
await writeFile(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const report={status:'PENDING_ART_REVIEW',releaseAllowed:false,generatedOutputs:9,selectedImageEdits:6,rejectedPositionVariants:['007','007-lift','008'],preparedKeys:19,originalReference:1,originalAuthoredKeys:6,retainedInterpolatedKeys:6,frames:37,fps:15,periodMs:3000,reverseReuse:'frame[36-i] exactly equals frame[i]',parentFrameScopeSha256:parentScope,rawFrameScopeSha256:hash(Buffer.from(frames.map(hash).join(''))),poses,productionChanged:false};
await writeFile(resolve(out,'review/assembly.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
