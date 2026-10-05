// Fail-closed geometry/identity gate. Human visual review is a separate gate.
import sharp from 'sharp';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=resolve(root,'docs/assistant/art-pilot-v6'),S=768;
const manifest=JSON.parse(await readFile(resolve(out,'interpolation.json'),'utf8'));
const prep=JSON.parse(await readFile(resolve(out,'key-preparation.json'),'utf8'));
const neutral=await sharp(resolve(out,'reference/neutral-clean.png')).ensureAlpha().raw().toBuffer();
const results={status:'PENDING_ART_REVIEW',releaseAllowed:false,automatic:[],visualReview:'pending',originalsUnchanged:true};
const artScope=createHash('sha256');
const registration=JSON.parse(await readFile(resolve(root,'docs/assistant/chibi-v5-inbetween-registration.json'),'utf8'));
for(const [file,{sha256}] of Object.entries(registration.original.files)){const bytes=await readFile(resolve(root,'public/assistant',file));if(createHash('sha256').update(bytes).digest('hex')!==sha256)throw Error('Original artwork changed: '+file);}
await mkdir(resolve(out,'review'),{recursive:true});
function allowed(action,x,y){if(action==='wave'){const [l,t,r,b]=prep.adjustments.find(a=>a.type==='wave-static-pixel-protection').editableRoi;return x>=l&&x<=r&&y>=t&&y<=b&&!(x>=236&&x<530&&y>=155&&y<398&&neutral[(y*S+x)*4+3]>=8)}return prep.adjustments.find(a=>a.type==='blink-static-pixel-protection').editableEyes.some(([cx,cy,rx,ry,minY])=>y>=minY&&((x-cx)/rx)**2+((y-cy)/ry)**2<1)}
function metrics(bytes,action){let l=S,t=S,r=-1,b=-1,changedOutside=0,whiteEdge=0;for(let y=0;y<S;y++)for(let x=0;x<S;x++){const p=(y*S+x)*4,a=bytes[p+3];if(a>=8){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y)}if(!allowed(action,x,y)&&(bytes[p]!==neutral[p]||bytes[p+1]!==neutral[p+1]||bytes[p+2]!==neutral[p+2]||bytes[p+3]!==neutral[p+3]))changedOutside++;if(a>=20&&a<220&&bytes[p]>=230&&bytes[p+1]>=230&&bytes[p+2]>=230)whiteEdge++;}return{bounds:[l,t,r,b],changedOutside,whiteEdge,safeMargins:[l,t,S-1-r,S-1-b].every(v=>v>=Math.ceil(S*.2))}}
for(const [action,config] of Object.entries(manifest.plan)){
 const files=Array.from({length:config.count},(_,i)=>resolve(out,'frames',action,String(i).padStart(3,'0')+'.png'));
 const frames=[],failures=[],hashes=new Set();let pngBytes=0;
 for(let i=0;i<files.length;i++){const m=await sharp(files[i]).metadata();if(m.width!==S||m.height!==S||!m.hasAlpha)throw Error('Wrong PNG format');const bytes=await sharp(files[i]).ensureAlpha().raw().toBuffer();const measured=metrics(bytes,action);if(!measured.safeMargins)failures.push({frame:i,type:'safety-margin'});if(measured.changedOutside)failures.push({frame:i,type:'immutable-region',pixels:measured.changedOutside});if((i===0||i===files.length-1)&&!bytes.equals(neutral))failures.push({frame:i,type:'neutral-endpoint'});const sha256=createHash('sha256').update(bytes).digest('hex');hashes.add(sha256);artScope.update(action+':'+i+':'+sha256+'\n');pngBytes+=(await stat(files[i])).size;frames.push({index:i,rgbaSha256:sha256,...measured});}
 const exports=[];
 for(const fps of [15,30]){const path=resolve(out,`${action}-${fps}fps.webp`),meta=await sharp(path,{animated:true}).metadata();exports.push({fps,bytes:(await stat(path)).size,decodedPages:meta.pages,pageHeight:meta.pageHeight,alpha:meta.hasAlpha,durationMs:meta.delay.reduce((a,b)=>a+b,0)});if(meta.pageHeight!==S||!meta.hasAlpha||exports.at(-1).durationMs!==config.duration*1000)failures.push({type:'webp-format-duration',fps});}
 results.automatic.push({action,passed:failures.length===0,frames:files.length,uniqueRgbaFrames:hashes.size,pngBytes,exports,failures,measurements:frames});
 // Every frame is shown; contact pages use ONE shared inspection crop only.
 for(const theme of ['light','dark'])for(let start=0;start<files.length;start+=16){const group=files.slice(start,start+16),tiles=await Promise.all(group.map(async(path,index)=>({input:await sharp(path).extract({left:176,top:144,width:416,height:512}).resize(260,320).png().toBuffer(),left:index%4*260,top:Math.floor(index/4)*320})));await sharp({create:{width:1040,height:Math.ceil(group.length/4)*320,channels:4,background:theme==='light'?'#f4f1e9':'#181e25'}}).composite(tiles).png().toFile(resolve(out,'review',`${action}-all-${String(start).padStart(3,'0')}-${theme}.png`));}
 // Inspect every changing eye/hand at enlarged scale on a fixed common crop.
 const roi=action==='blink'?{left:302,top:301,width:163,height:70}:{left:184,top:319,width:177,height:214};
 for(let start=0;start<files.length;start+=16){const group=files.slice(start,start+16),height=action==='blink'?140:300,width=action==='blink'?326:248,tiles=await Promise.all(group.map(async(path,index)=>({input:await sharp(path).extract(roi).resize(width,height,{fit:'contain',background:'#f4f1e9'}).png().toBuffer(),left:index%4*width,top:Math.floor(index/4)*height})));await sharp({create:{width:width*4,height:Math.ceil(group.length/4)*height,channels:4,background:'#f4f1e9'}}).composite(tiles).png().toFile(resolve(out,'review',`${action}-detail-${String(start).padStart(3,'0')}.png`));}
}
results.artScopeSha256=artScope.digest('hex');
try{
 const visual=JSON.parse(await readFile(resolve(out,'review/visual.json'),'utf8'));
 results.visualReview=visual;
 if(visual.artScopeSha256!==results.artScopeSha256)results.status='REJECTED_STALE_ART_REVIEW';
 else if(Object.values(visual.actions).some(a=>a.status==='REJECTED'))results.status='REJECTED_ART';
 else results.status='PILOT_VISUAL_REVIEW_PASSED_NOT_RELEASED';
}catch(error){if(error.code!=='ENOENT')throw error;}
if(results.automatic.some(r=>!r.passed))results.status='REJECTED_TECHNICAL';
await writeFile(resolve(out,'review/automatic.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({status:results.status,artScopeSha256:results.artScopeSha256,releaseAllowed:false,results:results.automatic.map(r=>({action:r.action,passed:r.passed,frames:r.frames,uniqueRgbaFrames:r.uniqueRgbaFrames,pngBytes:r.pngBytes,exports:r.exports,failures:r.failures}))},null,2));
if(results.status==='REJECTED_TECHNICAL'||(process.argv.includes('--release-gate')&&results.status!=='APPROVED_FOR_INTEGRATION'))process.exitCode=1;
