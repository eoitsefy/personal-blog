// Local RIFE experiment only. Whole RGBA frames remain offline review assets.
import sharp from 'sharp';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'docs/assistant/art-pilot-v6'), tmp = resolve(root, '.tool-tmp/art-pilot-rife');
const exe = resolve(root, '.tool-tmp/art-pilot-tools/rife-portable/rife-ncnn-vulkan.exe');
const model = resolve(root, '.tool-tmp/art-pilot-tools/rife-portable/rife-v4.6');
const S = 768, neutralPath = resolve(out,'reference/neutral-clean.png');
const neutral = await sharp(neutralPath).ensureAlpha().raw().toBuffer();
const prep = JSON.parse(await readFile(resolve(out,'key-preparation.json'),'utf8'));
const download = JSON.parse(await readFile(resolve(root,'.tool-tmp/art-pilot-tools/rife-download.json'),'utf8'));
const trace = [];
const plan = {
 blink: { keys: [0,3,1,3,2], stepsPerInterval: 4, count: 17, duration: 4, activeFps: 30 },
 wave: { keys: [0,1,2,3,4,3,4,3,2,1,0], stepsPerInterval: 6, count: 61, duration: 3, activeFps: 30 },
};
async function callRife(input, output, count) {
 await mkdir(output,{recursive:true});
 const args = ['-i',input,'-o',output,'-n',String(count),'-m',model,'-g','1','-j','1:1:1','-f','%08d.png'];
 const start = Date.now();
 const result = await run(exe,args,{cwd:dirname(exe),timeout:120000,maxBuffer:1000000});
 trace.push({ args: args.map(arg => arg.startsWith(root) ? arg.slice(root.length+1).replaceAll('\\','/') : arg), elapsedMs:Date.now()-start, diagnostics:result.stderr.split('\n').filter(line=>/NVIDIA|GeForce|Intel|failed|error|device|queue|VK_/i.test(line)) });
}
function editable(action,x,y) {
 if(action==='blink') return prep.adjustments.find(a=>a.type==='blink-static-pixel-protection').editableEyes.some(([cx,cy,rx,ry,minY])=>y>=minY && ((x-cx)/rx)**2+((y-cy)/ry)**2<1);
 const [l,t,r,b] = prep.adjustments.find(a=>a.type==='wave-static-pixel-protection').editableRoi;
 return x>=l && y>=t && x<=r && y<=b;
}
for (const [action, config] of Object.entries(plan)) {
 const colorIn = resolve(tmp,action,'color-in'), alphaIn = resolve(tmp,action,'alpha-in');
 await Promise.all([mkdir(colorIn,{recursive:true}),mkdir(alphaIn,{recursive:true}),mkdir(resolve(out,'frames',action),{recursive:true})]);
 for(let i=0;i<config.keys.length;i++) {
  const key = resolve(out,'keys',`${action}-${String(config.keys[i]).padStart(2,'0')}.png`), png = await sharp(key).ensureAlpha().raw().toBuffer();
  const color = Buffer.alloc(S*S*3), alpha = Buffer.alloc(S*S*3);
  // RIFE's portable executable is RGB-only. Never discard transparency silently.
  // Color pass on neutral grey + a separate grayscale alpha pass, then recover
  // unpremultiplied RGB and restore all immutable original pixels.
  for(let p=0;p<S*S;p++) {
   const a=png[p*4+3]/255;
   for(let c=0;c<3;c++){color[p*3+c]=Math.round(png[p*4+c]*a+128*(1-a));alpha[p*3+c]=png[p*4+3];}
  }
  const name=String(i).padStart(8,'0')+'.png';
  await sharp(color,{raw:{width:S,height:S,channels:3}}).png().toFile(resolve(colorIn,name));
  await sharp(alpha,{raw:{width:S,height:S,channels:3}}).png().toFile(resolve(alphaIn,name));
 }
 const colorOut=resolve(tmp,action,'color-out'), alphaOut=resolve(tmp,action,'alpha-out');
 // Directory mode samples at keyCount/outputCount, not (keys-1)/(frames-1).
 // Request an exact multiple then ignore its trailing duplicated last key.
 const inferenceCount = config.keys.length * config.stepsPerInterval;
 await callRife(colorIn,colorOut,inferenceCount);
 if(action==='wave') await callRife(alphaIn,alphaOut,inferenceCount);
 const files=[];
 for(let i=0;i<config.count;i++) {
  const name=String(i+1).padStart(8,'0')+'.png';
  const color=await sharp(resolve(colorOut,name)).removeAlpha().raw().toBuffer();
  const alpha=action==='wave'?await sharp(resolve(alphaOut,name)).removeAlpha().raw().toBuffer():null;
  const data=Buffer.from(neutral);
  for(let y=0;y<S;y++) for(let x=0;x<S;x++) {
   const p=y*S+x;
   if(!editable(action,x,y)) continue;
   if(action==='wave' && x>=236 && x<530 && y>=155 && y<398 && neutral[p*4+3]>=8) continue;
   const a=action==='wave'?Math.round((alpha[p*3]+alpha[p*3+1]+alpha[p*3+2])/3):neutral[p*4+3];
   if(a<8){data.fill(0,p*4,p*4+4);continue;}
   for(let c=0;c<3;c++) data[p*4+c]=Math.max(0,Math.min(255,Math.round((color[p*3+c]-128*(1-a/255))/(a/255))));
   data[p*4+3]=a;
  }
  // Endpoints are exact original neutral pixels, not approximate predictions.
  const frame=resolve(out,'frames',action,String(i).padStart(3,'0')+'.png');
  if(i===0 || i===config.count-1) await copyFile(neutralPath,frame);
  else await sharp(data,{raw:{width:S,height:S,channels:4}}).png().toFile(frame);
  files.push(frame);
 }
 for(const fps of [15,30]) {
  const selected=files.filter((_,index)=>fps===30 || index%2===0);
  const pngs=await Promise.all(selected.map(file=>readFile(file)));
  const delay=selected.map(()=>Math.round(1000/fps));
  delay[delay.length-1]=Math.round(config.duration*1000-delay.slice(0,-1).reduce((a,b)=>a+b,0));
  await sharp(pngs,{join:{animated:true}}).webp({lossless:true,effort:6,loop:0,delay}).toFile(resolve(out,`${action}-${fps}fps.webp`));
 }
 console.log(`${action}: ${config.count} PNG frames, 15/30 fps lossless WebP samples`);
}
await writeFile(resolve(out,'interpolation.json'),JSON.stringify({status:'offline-art-review-required',tool:'official rife-ncnn-vulkan',model:'rife-v4.6',download,method:'RGB and separate alpha pass; immutable original region protection; no layered animation, no crossfade',plan,excludedKeys:{wave:[5,6],reason:'05 palm partly occluded by reference hair; 06 redundant recovery, reverse original lift keys instead'},trace},null,2)+'\n');
