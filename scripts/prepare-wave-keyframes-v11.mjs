// Offline candidate preparation. Never writes key/final approval or deploys.
import sharp from 'sharp';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, S, neutralPath, register, bake, readPixels, hash, editable } from './animation/wave-v8.mjs';
import { contactSheets } from './animation/contact-sheet.mjs';
const version=process.argv[2]||'v11';
if(!['v11','v12','v13','v14','v15'].includes(version))throw Error('unknown_candidate_recipe');
const base='docs/assistant/wave-keyframes-'+version, out=resolve(root,base), sourceBase=resolve(root,'docs/assistant/wave-keyframes-v10/generated');
const parentScope='21167c671bfbf29737b1c939bb50061890ddc612e66772b11c8514c71717dd68';
const selected=new Map([[1,{id:'001',hand:[0,0,0,0]}],[7,{id:'007',hand:[0,0,0,0]}],[8,{id:'008-exact',hand:[0,0,0,0]}],[14,{id:'014',hand:[243,372,64,66]}],[16,{id:'016',hand:[232,355,69,70]}],[17,{id:'017',hand:[224,347,69,68]}]]);
const originalKeys=new Set([0,3,6,9,12,15,18]);
// One continuous inverse mapping of the freshly repaired sleeve and fist.
// The shoulder/body seam stays anchored; no face/body/foot pixels are moved.
// Colors and alpha are sampled together in premultiplied space, never alpha-clamped.
function alignArm(input) {
  const result=Buffer.from(input);
  for(let y=400;y<527;y++)for(let x=218;x<346;x++) {
    const xWeight=Math.max(0,Math.min(1,(346-x)/(version!=='v11'?32:16)));
    const yWeight=version!=='v11'?Math.max(0,Math.min(1,(y-400)/20,(495-y)/30)):1;
    const weight=xWeight*yWeight,sx=x+6*weight,sy=y+11*weight;
    const x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0, p=(y*S+x)*4;
    let a=0;const colors=[0,0,0];
    for(const [dx,dy,w]of [[0,0,(1-fx)*(1-fy)],[1,0,fx*(1-fy)],[0,1,(1-fx)*fy],[1,1,fx*fy]]) {
      const q=((y0+dy)*S+x0+dx)*4,aw=input[q+3]/255*w;a+=aw;
      for(let c=0;c<3;c++)colors[c]+=input[q+c]*aw;
    }
    result[p+3]=Math.round(a*255);for(let c=0;c<3;c++)result[p+c]=a?Math.round(colors[c]/a):0;
  }
  return result;
}
try{await readFile(resolve(out,'review/key-approval.json'));throw Error('reviewed_inputs_are_immutable_use_new_version');}catch(e){if(e.code!=='ENOENT')throw e;}
await Promise.all(['keys','frames','registered','review'].map(p=>mkdir(resolve(out,p),{recursive:true})));
const neutral=(await readPixels(neutralPath)).data, keys=[],poses=[];
for(let i=0;i<19;i++) {
  const name=String(i).padStart(3,'0')+'.png', target=resolve(out,'keys',name), spec=selected.get(i);let origin;
  if(spec) {
    const source=resolve(sourceBase,spec.id+'.png'),reg=await register(source),aligned=i===7?alignArm(reg.data):reg.data;
    await sharp(aligned,{raw:{width:S,height:S,channels:4}}).png().toFile(resolve(out,'registered',name));
    const data=bake(aligned,neutral,spec.hand);
    if(i===7&&version!=='v11') {
      // The registration affects only the sleeve/hand, not the adjacent hem/pocket.
      const prior=(await readPixels(resolve(root,'docs/assistant/wave-keyframes-v9/frames/007.png'))).data;
      for(let y=480;y<527;y++)for(let x=323;x<346;x++){const p=(y*S+x)*4;prior.copy(data,p,p,p+4);}
      if(['v13','v14','v15'].includes(version)) {
        const originalCloth=(await readPixels(resolve(root,'docs/assistant/wave-keyframes-v9/frames',version!=='v13'?'000.png':'006.png'))).data;
        for(let y=454;y<480;y++)for(let x=version!=='v13'?325:317;x<346;x++) {
          const p=(y*S+x)*4,skin=data[p]>170&&data[p+1]>110&&data[p+2]>90;
          // Only common opaque cloth; never overwrite hand/edge/transparent silhouette.
          if(!skin&&data[p+3]>=245&&originalCloth[p+3]>=245)originalCloth.copy(data,p,p,p+4);
        }
        if(version==='v15')for(let y=460;y<=467;y++)for(let x=318;x<=324;x++) {
          const p=(y*S+x)*4,gold=data[p]>=125&&data[p+1]>=90&&data[p+2]<=105&&data[p+1]>data[p+2]+30&&data[p]>=data[p+1];
          if(gold&&data[p+3]>=245&&originalCloth[p+3]>=245)originalCloth.copy(data,p,p,p+4);
        }
      }
    }
    await sharp(data,{raw:{width:S,height:S,channels:4}}).png().toFile(target);
    origin={kind:'image-edited-frame',parentFrameScopeSha256:parentScope,parentFrameIndex:i,editSourceSha256:hash(await readFile(source))};
    poses.push({frame:i,source:'docs/assistant/wave-keyframes-v10/generated/'+spec.id+'.png',registration:reg.shift,aboveShoulderEditRect:spec.hand,armOnlyAlignment:i===7?{translation:[-6,-11],fixedSeamX:346,falloffStartX:version!=='v11'?314:330,verticalFalloff:version!=='v11'?[400,420,465,495]:null,preservedPocket:version!=='v11',restoredOriginalGoldCloth:['v13','v14','v15'].includes(version),clothSource:version!=='v13'?'original neutral':'prior bridge',removedIsolatedGoldFragment:version==='v15',premultipliedRgbaSampling:true}:null});
  }else{
    await copyFile(resolve(root,'docs/assistant/wave-keyframes-v9/frames',name),target);
    origin=i===0?{kind:'reference'}:originalKeys.has(i)?{kind:'authored-keyframe'}:{kind:'interpolated-frame',parentFrameScopeSha256:parentScope,parentFrameIndex:i};
  }
  keys.push({id:'pose-'+String(i).padStart(2,'0'),file:base+'/keys/'+name,sha256:hash(await readFile(target)),provenance:origin});
}
const frames=[],paths=[];
for(let i=0;i<37;i++) {
  const f=i<=18?i:36-i,path=resolve(out,'frames',String(i).padStart(3,'0')+'.png');
  await copyFile(resolve(out,'keys',String(f).padStart(3,'0')+'.png'),path);paths.push(path);frames.push((await readPixels(path)).data);
}
const mask=Buffer.alloc(S*S*4);
for(let y=0;y<S;y++)for(let x=0;x<S;x++)if(editable(x,y,neutral))mask.fill(255,(y*S+x)*4,(y*S+x)*4+4);
await sharp(mask,{raw:{width:S,height:S,channels:4}}).png().toFile(resolve(out,'editable-mask.png'));
await contactSheets(paths,{width:S,height:S},resolve(out,'review'),{left:208,top:342,width:145,height:189});
const bound=async file=>({file,sha256:hash(await readFile(resolve(root,file)))}),ids=keys.map(k=>k.id);
const manifest={schemaVersion:1,id:'wave-'+version,action:'wave',reference:await bound('docs/assistant/wave-keyframes-v8/reference/neutral-clean.png'),editableMask:await bound(base+'/editable-mask.png'),keys,canvas:{width:S,height:S,safetyInset:.2},motion:{sequence:[...ids,...ids.slice(0,-1).reverse()],stepsPerInterval:1,fps:15,loopDurationMs:3000},interpolation:{method:'hold',gpu:1},review:{keyApproval:base+'/review/key-approval.json',finalApproval:base+'/review/final-approval.json'}};
await writeFile(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const report={status:'PENDING_ART_REVIEW',releaseAllowed:false,preparedKeyCount:19,referenceFrames:1,authoredKeyframes:6,imageEditedFrames:6,interpolatedFrames:6,frames:37,fps:15,periodMs:3000,reverseReuse:'frame[36-i] exactly equals frame[i]',parentFrameScopeSha256:parentScope,rawFrameScopeSha256:hash(Buffer.from(frames.map(hash).join(''))),poses,productionChanged:false};
await writeFile(resolve(out,'review/assembly.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
