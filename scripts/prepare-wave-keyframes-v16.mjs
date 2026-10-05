// Repair only the rejected opening pose. This never approves or deploys art.
import sharp from 'sharp';
import { mkdir, readFile, writeFile, copyFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, S, register, readPixels, hash, editable, neutralPath } from './animation/wave-v8.mjs';
import { contactSheets } from './animation/contact-sheet.mjs';
const base='docs/assistant/wave-keyframes-v16', out=resolve(root,base), prior=resolve(root,'docs/assistant/wave-keyframes-v15');
try { await lstat(resolve(out,'manifest.json')); throw Error('candidate_exists_use_new_version'); } catch(e) { if(e.code!=='ENOENT')throw e; }
await Promise.all(['keys','frames','registered','review'].map(p=>mkdir(resolve(out,p),{recursive:true})));
const parent=JSON.parse(await readFile(resolve(prior,'manifest.json'),'utf8'));
const source='docs/assistant/wave-keyframes-v16/generated/014-partial-open.png', reg=await register(resolve(root,source));
const neutral=(await readPixels(neutralPath)).data, data=Buffer.from((await readPixels(resolve(prior,'keys/014.png'))).data);
// A fixed wrist/hand rectangle only. The arm, cuff below the wrist and all
// protected head/body/soles retain v15 pixels; no per-frame figure resizing.
const rect={left:247,top:374,width:54,height:54};
for(let y=rect.top;y<rect.top+rect.height;y++)for(let x=rect.left;x<rect.left+rect.width;x++) {
  if(!editable(x,y,neutral))continue;
  const p=(y*S+x)*4;reg.data.copy(data,p,p,p+4);
}
await sharp(reg.data,{raw:{width:S,height:S,channels:4}}).png().toFile(resolve(out,'registered/014.png'));
await sharp(data,{raw:{width:S,height:S,channels:4}}).png().toFile(resolve(out,'keys/014.png'));
const keys=[];
for(let i=0;i<19;i++) {
  const name=String(i).padStart(3,'0')+'.png';if(i!==14)await copyFile(resolve(prior,'keys',name),resolve(out,'keys',name));
  keys.push({...parent.keys[i],file:base+'/keys/'+name,sha256:hash(await readFile(resolve(out,'keys',name))),
    ...(i===14?{provenance:{kind:'image-edited-frame',parentFrameScopeSha256:'ce1db3f2335f58f7d1d8564ce3484d45c83d1417d7f672569014b1086e23d66c',parentFrameIndex:14,editSourceSha256:hash(await readFile(resolve(root,source)))}}:{})});
}
const paths=[],pixels=[];
for(let i=0;i<37;i++) {
  const file=resolve(out,'frames',String(i).padStart(3,'0')+'.png');await copyFile(resolve(out,'keys',String(Math.min(i,36-i)).padStart(3,'0')+'.png'),file);
  paths.push(file);pixels.push((await readPixels(file)).data);
}
await copyFile(resolve(prior,'editable-mask.png'),resolve(out,'editable-mask.png'));
await contactSheets(paths,{width:S,height:S},resolve(out,'review'),{left:208,top:342,width:145,height:189});
const manifest={...parent,id:'wave-v16',keys,editableMask:{...parent.editableMask,file:base+'/editable-mask.png'},review:{keyApproval:base+'/review/key-approval.json',finalApproval:base+'/review/final-approval.json'}};
await writeFile(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const report={status:'PENDING_ART_REVIEW',releaseAllowed:false,productionChanged:false,parent:'wave-v15',changedFrames:[14,22],
  changedRegion:rect,registration:reg.shift,source,rawFrameScopeSha256:hash(Buffer.from(pixels.map(hash).join(''))),note:'All other 35 PNGs retain exact v15 pixels; reverse reuses the corrected forward pose. No deletion, timing change or whole-character translation.'};
await writeFile(resolve(out,'review/assembly.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
