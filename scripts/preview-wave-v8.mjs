// Local file preview and browser playback checks, not production acceptance.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { out } from './animation/wave-v8.mjs';
const report=JSON.parse(await readFile(resolve(out,'review/matte-interpolation.json'),'utf8'));
const count=report.outputFrameCount;
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>挥手离线审查</title><style>body{margin:0;background:#f4f1e9;color:#292929;font:16px/1.6 system-ui}main{max-width:850px;margin:auto;padding:24px}button,select,input{font:inherit}button,select{min-height:44px;margin:4px;padding:4px 12px}label{display:inline-flex;align-items:center;gap:8px;white-space:nowrap}canvas{display:block;width:min(100%,500px);height:auto;margin:auto}body.dark{background:#181e25;color:#eee}p{max-width:700px}input{width:min(95%,600px)}</style>
<main><h1>挥手离线审查</h1><p>两组33帧样片均拒收，不能发布。原头脸和脚部固定；新增三张姿态，插值帧不计作独立绘制。</p>
<label>补帧方式 <select id="mode"><option value="matte-frames">单绿幕补帧</option><option value="frames">RGB与alpha分开补帧</option></select></label>
<button id="play">播放</button><button id="back">上一帧</button><button id="next">下一帧</button><button id="theme">浅深底</button>
<label>速度 <select id="speed"><option value="1">15fps</option><option value=".5">半速</option></select></label>
<canvas width="768" height="768" aria-label="完整人物动作预览"></canvas><input id="seek" type="range" min="0" max="${count-1}" value="0" aria-label="帧序号"><output id="index">0</output>
<p>建议逐帧查看6/26号抬臂中段，以及张掌段指尖。帧数提高不能消除残影；两个旧样片的确认不适用于本组。</p></main>
<script>
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true}),frames={},seek=document.querySelector('#seek'),label=document.querySelector('#index');
let current=0,playing=false,tick=0,start=0,visited=[],cycles=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)');
async function load(){for(const mode of ['frames','matte-frames']){frames[mode]=await Promise.all(Array.from({length:${count}},(_,i)=>new Promise((ok,fail)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=fail;im.src=mode+'/'+String(i).padStart(3,'0')+'.png';})));}draw(0);window.ready=true;}
function draw(i){current=i;seek.value=i;label.value=i;ctx.clearRect(0,0,768,768);ctx.drawImage(frames[document.querySelector('#mode').value][i],0,0);visited.push(i);}
function stop(){playing=false;cancelAnimationFrame(tick);document.querySelector('#play').textContent='播放';}
function animate(t){if(!playing)return;const elapsed=(t-start)*Number(document.querySelector('#speed').value),within=elapsed%3000;cycles=Math.floor(elapsed/3000);draw(Math.min(${count-1},Math.floor(within/67)));tick=requestAnimationFrame(animate);}
document.querySelector('#play').onclick=()=>{if(playing){stop();return;}if(reduced.matches)return;playing=true;start=performance.now();document.querySelector('#play').textContent='暂停';tick=requestAnimationFrame(animate);};
document.querySelector('#next').onclick=()=>{stop();draw((current+1)%${count});};document.querySelector('#back').onclick=()=>{stop();draw((current+${count-1})%${count});};
seek.oninput=()=>{stop();draw(Number(seek.value));};document.querySelector('#mode').onchange=()=>{stop();draw(current);};document.querySelector('#theme').onclick=()=>document.body.classList.toggle('dark');
reduced.addEventListener('change',()=>{if(reduced.matches)stop();});document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
window.review={draw,stop,state:()=>({current,playing,visited,cycles}),reset:()=>{visited=[];cycles=0;},pixels:()=>Array.from(ctx.getImageData(0,0,768,768).data)};load();
</script></html>`;
await writeFile(resolve(out,'preview.html'),html);
if(process.argv.includes('--write-only'))process.exit(0);
const req=createRequire(import.meta.url);
const {chromium}=req('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const temp='D:/CodexTools/assistant-animation/browser-temp';await mkdir(temp,{recursive:true});
// Same-origin loopback avoids file:// canvas taint. Only this pack is served.
const server=createServer(async (request,response)=>{
  const path=new URL(request.url,'http://127.0.0.1').pathname;
  const frame=path.match(/^\/(matte-frames|frames)\/(\d{3})\.png$/);
  const preview=path==='/'||path==='/preview.html';
  if(request.method!=='GET'||(!preview&&(!frame||Number(frame[2])>=count))){response.writeHead(404);response.end();return;}
  try{const bytes=await readFile(resolve(out,preview?'preview.html':frame[1]+'/'+frame[2]+'.png'));
    response.writeHead(200,{'Content-Type':preview?'text/html; charset=utf-8':'image/png','Cache-Control':'no-store'});response.end(bytes);
  }catch{response.writeHead(404);response.end();}
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,channel:'msedge',env:{...process.env,TEMP:temp,TMP:temp}});
const results=[],errors=[],external=[];
try {
  const page=await browser.newPage({viewport:{width:1100,height:1050}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{const url=route.request().url();if(new URL(url).origin===origin)await route.continue();else{external.push(url);await route.abort();}});
  await page.goto(origin+'/preview.html');await page.waitForFunction(()=>window.ready===true);
  for(const mode of ['matte-frames','frames']) {
    await page.selectOption('#mode',mode);
    const pixels=await page.evaluate(()=>{window.review.draw(0);return window.review.pixels();});
    const framesCheck=await page.evaluate(({original,count})=>{
      const failures=[];let maxColorDifference=0;for(let i=0;i<count;i++){window.review.draw(i);const data=document.querySelector('canvas').getContext('2d').getImageData(0,0,768,768).data;
      for(let y=0;y<768;y++)for(let x=0;x<768;x++){const p=(y*768+x)*4;if((y<400&&original[p+3]>=8)||(x>=346&&y>=400&&y<527)||y>=527){
      const a=original[p+3],quantum=Math.ceil(255/Math.max(1,a)),difference=Math.max(Math.abs(data[p]-original[p]),Math.abs(data[p+1]-original[p+1]),Math.abs(data[p+2]-original[p+2]));
      maxColorDifference=Math.max(maxColorDifference,difference);
      // Canvas readback premultiplies/unpremultiplies 8-bit edge colors.
      // Alpha remains exact. Original PNG bytes have a separate zero-error test.
      if(data[p+3]!==a||difference>quantum){failures.push({frame:i,x,y,before:original.slice(p,p+4),after:Array.from(data.slice(p,p+4))});y=768;break;}}}}
      return {count,staticRegionFailures:failures,maxColorDifference,colorTolerance:'One premultiplied quantum ceil(255/alpha); exact alpha; raw PNG bytes tested separately with zero tolerance'};
    },{original:pixels,count});
    if(framesCheck.staticRegionFailures.length){console.log(JSON.stringify(framesCheck));throw Error('browser_static_region_changed');}
    await page.evaluate(()=>window.review.reset());await page.selectOption('#speed','1');await page.click('#play');
    await page.waitForFunction(()=>new Set(window.review.state().visited).size===33&&window.review.state().cycles>=1,{},{timeout:6000});
    await page.click('#play');const normal=await page.evaluate(()=>window.review.state());
    await page.evaluate(()=>window.review.reset());await page.selectOption('#speed','.5');await page.click('#play');
    await page.waitForFunction(()=>new Set(window.review.state().visited).size===33&&window.review.state().cycles>=1,{},{timeout:10000});
    await page.click('#play');const half=await page.evaluate(()=>window.review.state());
    await page.emulateMedia({reducedMotion:'reduce'});await page.click('#play');
    const reduced=await page.evaluate(()=>window.review.state().playing);if(reduced)throw Error('reduced_motion_not_respected');
    await page.emulateMedia({reducedMotion:'no-preference'});
    results.push({mode,...framesCheck,normalObservedFrames:new Set(normal.visited).size,halfObservedFrames:new Set(half.visited).size,normalFullCycles:normal.cycles,halfFullCycles:half.cycles,reducedMotionPaused:!reduced});
  }
  await page.selectOption('#mode','matte-frames');await page.evaluate(()=>window.review.draw(6));
  await page.screenshot({path:resolve(out,'review/browser-light.png')});await page.click('#theme');
  await page.screenshot({path:resolve(out,'review/browser-dark.png')});
  await page.setViewportSize({width:390,height:920});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw Error('mobile_preview_overflow');
  await page.screenshot({path:resolve(out,'review/browser-mobile.png')});
  if(errors.length||external.length)throw Error('browser_error_or_external_request');
  await writeFile(resolve(out,'review/playback.json'),JSON.stringify({date:new Date().toISOString(),status:'FUNCTIONAL_PREVIEW_ONLY',artAccepted:false,releaseAllowed:false,sourceFrameScopeSha256:report.frameScopeSha256,results,mobileOverflow:overflow,errors,externalRequests:external,productionChanged:false},null,2)+'\n');
  console.log('Offline playback, all 33 frames per method, pause, half speed and reduced-motion checks passed; ART REMAINS REJECTED');
} finally {await browser.close();await new Promise(ok=>server.close(ok));}
