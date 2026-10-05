// Local-only art review player. Opens no model API, production site, or mic.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(root,'docs/assistant/art-pilot-v6');
const manifest=JSON.parse(await readFile(resolve(out,'interpolation.json'),'utf8'));
const plan=manifest.plan;
const allowed=new Set(['/', '/preview.html','/reference/neutral-clean.png',...['blink','wave'].flatMap(action=>[
 ...Array.from({length:plan[action].count},(_,i)=>`/frames/${action}/${String(i).padStart(3,'0')}.png`),
 `/${action}-15fps.webp`,`/${action}-30fps.webp`,
])]);
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>助手样片 · 离线美术审查</title><style>
*{box-sizing:border-box}body{margin:0;padding:20px;background:#f1eee6;color:#252725;font:16px/1.6 system-ui,sans-serif}h1{font-size:24px}h2{font-size:20px}p{margin:8px 0}.toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}button,select{font:inherit;min-height:42px;padding:7px 12px;background:#fff;color:#202020;border:1px solid #888;border-radius:7px}.samples{display:flex;flex-wrap:wrap;gap:20px;margin:18px 0}article{padding:16px;border:1px solid #97978c;max-width:100%;border-radius:8px}.stage{background:#f1eee6;border:1px solid #999;max-width:100%;display:block}canvas{display:block;max-width:100%;height:auto}.slider{display:flex;flex-wrap:wrap;gap:8px;align-items:center}input{max-width:100%}a{color:#694600}.note{max-width:1000px}.status{color:#842c22;font-weight:600}body.dark{background:#191e25;color:#f7f2e5}body.dark a{color:#ffcc63}small{display:block}details{max-width:1000px}code{overflow-wrap:anywhere}
@media(max-width:500px){body{padding:10px}article{padding:8px}.samples{gap:12px}h1{font-size:21px}}
</style><h1>待机眨眼 / 挥手</h1><p class="status">离线候选样片，不是线上版本。美术放行状态见 REVIEW.md；技术检查不能替代美术审查。</p>
<div class="toolbar"><button id="toggle">暂停</button><label>帧率 <select id="fps"><option>15</option><option>30</option></select></label><label>速度 <select id="speed"><option value="1">正常</option><option value="0.5">半速</option></select></label><label>画布 <select id="size"><option>400</option><option>200</option></select></label><label>底色 <select id="theme"><option value="cream">奶油</option><option value="white">白</option><option value="dark">深灰</option><option value="magenta">品红</option></select></label></div>
<div class="samples">${['blink','wave'].map(action=>`<article><h2>${action==='blink'?'待机眨眼':'挥手'}</h2><div class="stage"><canvas id="${action}" width="768" height="768"></canvas></div><small id="${action}-label"></small><div class="slider"><button data-step="${action}">下一帧</button><input type="range" aria-label="${action==='blink'?'眨眼':'挥手'}逐帧" id="${action}-slider" min="0" max="${plan[action].count-1}" value="0"></div><p><a href="${action}-15fps.webp">15 fps 动画</a> / <a href="${action}-30fps.webp">30 fps 动画</a></p></article>`).join('')}</div>
<p class="note">画布固定 768×768，原版头部、身体和脚部不漂移。正常播放中有中立停留；停留不是新增姿态。所有动作由完整 PNG 换帧播放，无整图渐变、骨骼拼装或整体左右移动。下方原版参考与样片使用同一固定画布。</p><img src="reference/neutral-clean.png" width="200" height="200" alt="原版中立参考" style="max-width:100%;height:auto"><details><summary>制作与审查资料</summary><p>原始关键帧、静区保护说明、真实补帧日志和全帧检查分别位于 generated、key-preparation.json、interpolation.json 与 review/。未运行 LoRA、ControlNet、IP-Adapter、EbSynth 或 ToonCrafter。</p></details>
<script>
const plan=${JSON.stringify(plan)};const images={}, current={blink:0,wave:0};let fps=15,speed=1,size=400,elapsed=0,last=performance.now(),playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,ready=false;
function load(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error(src));img.src=src})}
function draw(action,index){if(!ready)return;current[action]=index;const c=document.getElementById(action),ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingQuality='high';ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(images[action][index],0,0,c.width,c.height);c.dataset.frame=index;document.getElementById(action+'-slider').value=index;document.getElementById(action+'-label').textContent='帧 '+(index+1)+' / '+plan[action].count+' · '+fps+' fps';}
function resize(){for(const action of ['blink','wave']){const c=document.getElementById(action),article=c.closest('article');article.style.width=(size+36)+'px';const width=Math.min(size,c.parentElement.clientWidth);c.style.width=width+'px';c.style.height=width+'px';c.width=c.height=Math.round(width*devicePixelRatio);draw(action,current[action]);}}
function pause(){playing=false;document.getElementById('toggle').textContent='播放'}
function theme(value){document.body.classList.toggle('dark',value==='dark');const color={cream:'#f1eee6',white:'#fff',dark:'#171b22',magenta:'#b800a0'}[value];document.querySelectorAll('.stage').forEach(e=>e.style.background=color)}
document.getElementById('toggle').onclick=()=>{playing=!playing;last=performance.now();document.getElementById('toggle').textContent=playing?'暂停':'播放'};
document.getElementById('fps').onchange=e=>{fps=Number(e.target.value);for(const a of ['blink','wave'])draw(a,current[a])};
document.getElementById('speed').onchange=e=>speed=Number(e.target.value);
document.getElementById('size').onchange=e=>{size=Number(e.target.value);resize()};document.getElementById('theme').onchange=e=>theme(e.target.value);
for(const a of ['blink','wave']){document.getElementById(a+'-slider').oninput=e=>{pause();draw(a,Number(e.target.value))};document.querySelector('[data-step='+a+']').onclick=()=>{pause();draw(a,(current[a]+1)%plan[a].count)}}
addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});
function tick(now){if(ready&&playing){elapsed+=(now-last)*speed;for(const a of ['blink','wave']){const time=(elapsed/1000)%plan[a].duration,quantum=fps===15?2:1,index=Math.min(plan[a].count-1,Math.floor(time*30/quantum)*quantum);if(index!==current[a])draw(a,index)}}last=now;requestAnimationFrame(tick)}
window.pilot={pause,draw,theme,resize,frames:()=>({...current}),running:()=>playing,metrics:action=>{const c=document.getElementById(action),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let hash=2166136261;for(let p=Math.floor(c.height*.7)*c.width*4;p<d.length;p++)hash=Math.imul(hash^d[p],16777619);return{width:c.width,height:c.height,cssWidth:c.getBoundingClientRect().width,footHash:hash>>>0}}};
Promise.all(['blink','wave'].map(async a=>{images[a]=await Promise.all(Array.from({length:plan[a].count},(_,i)=>load('frames/'+a+'/'+String(i).padStart(3,'0')+'.png')))})).then(()=>{ready=true;resize();if(!playing)pause();document.documentElement.dataset.ready='true';requestAnimationFrame(tick)}).catch(e=>{document.documentElement.dataset.error=e.message;console.error(e)});
</script></html>`;
await writeFile(resolve(out,'preview.html'),html);
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(!allowed.has(path)){res.writeHead(404);res.end('Not found');return}if(path==='/'||path==='/preview.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);return}res.writeHead(200,{'Content-Type':path.endsWith('.webp')?'image/webp':'image/png'});res.end(await readFile(resolve(out,'.'+path)))}catch{res.writeHead(500);res.end('Preview read failed')}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;
if(process.argv.includes('--serve')){console.log(url);process.once('SIGINT',()=>server.close());}
else{
 const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 const browser=await chromium.launch({headless:true,channel:'msedge'}),errors=[],requests=[],results=[];
 await mkdir(resolve(out,'review'),{recursive:true});
 try{
  for(const viewportWidth of [1200,390])for(const dpr of [1,2]){
   const context=await browser.newContext({viewport:{width:viewportWidth,height:900},deviceScaleFactor:dpr});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
   await page.goto(url);await page.waitForSelector('html[data-ready=true]');await page.evaluate(()=>window.pilot.pause());
   for(const size of [200,400]){
    await page.locator('#size').selectOption(String(size));
    for(const action of ['blink','wave']){
     await page.evaluate(a=>window.pilot.draw(a,0),action);const first=await page.evaluate(a=>window.pilot.metrics(a),action);
     if(viewportWidth===1200)assert.equal(first.cssWidth,size,'Requested preview size was not applied');
     for(let index=0;index<plan[action].count;index++){await page.evaluate(({a,i})=>window.pilot.draw(a,i),{a:action,i:index});const m=await page.evaluate(a=>window.pilot.metrics(a),action);assert.equal(m.footHash,first.footHash,'Displayed foot drift '+JSON.stringify({action,index,size,viewportWidth,dpr,first,m}));}
     assert.equal(first.width,Math.round(first.cssWidth*dpr),'HiDPI backing store mismatch');results.push({viewportWidth,dpr,requestedCanvas:size,action,...first,allFramesChecked:plan[action].count});
    }
   }
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');
   for(const color of ['cream','white','dark','magenta']){await page.evaluate(c=>{window.pilot.theme(c);window.pilot.draw('blink',8);window.pilot.draw('wave',18)},color);await page.screenshot({path:resolve(out,'review',`browser-${viewportWidth}-dpr${dpr}-${color}.png`),fullPage:true});}
   await page.locator('#fps').selectOption('30');await page.locator('#speed').selectOption('0.5');await page.locator('#toggle').click();await page.waitForFunction(()=>window.pilot.frames().wave!==18);await page.locator('#toggle').click();const before=await page.evaluate(()=>window.pilot.frames());await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.deepEqual(await page.evaluate(()=>window.pilot.frames()),before);
   await context.close();
  }
  const context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage();await page.goto(url);await page.waitForSelector('html[data-ready=true]');assert.equal(await page.evaluate(()=>window.pilot.running()),false);await context.close();assert.deepEqual(errors,[]);assert.ok(requests.every(request=>new URL(request).origin===url),'Nonlocal request');
  await writeFile(resolve(out,'review/browser.json'),JSON.stringify({status:'technical-pass-art-review-separate',results,pause:true,reducedMotion:true,noOverflow:true,noProviderOrMicRequests:true,errors},null,2)+'\n');console.log(JSON.stringify({preview:resolve(out,'preview.html'),checks:results.length,technical:true,artAcceptance:false},null,2));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
