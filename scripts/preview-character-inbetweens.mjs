// Local-only material review. Rendering crops for QA never modifies source PNGs.
// Run with node --import tsx; --serve keeps the preview open instead of capturing.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CHARACTER_ACTIONS, CHARACTER_SHEETS, CHARACTER_POSES} from '../src/lib/assistant/character.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest=JSON.parse(await readFile(resolve(root, 'docs/assistant/chibi-v5-inbetween-registration.json'), 'utf8'));
assert.equal(manifest.status, 'candidate-materials-not-runtime');
const output=resolve(root, '.tool-tmp/chibi-inbetween-previews');
const originals=Object.fromEntries(Object.entries(CHARACTER_SHEETS).map(([action,sheet])=>[action,{
  ...sheet, poses:CHARACTER_POSES[CHARACTER_ACTIONS[action].row].map(rect=>({rect}))
}]));
const allowed=new Set([...Object.values(manifest.sheets),...Object.values(originals)].map(sheet=>sheet.src));
const data=JSON.stringify({manifest,originals}).replace(/</g, '\u003c');
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>原版助手 · 补帧素材预览</title><style>
*{box-sizing:border-box}body{margin:0;background:#f6f3eb;color:#282520;font:16px system-ui,sans-serif}
body.dark{background:#1c2027;color:#f5f0df}header{padding:24px;max-width:1200px;margin:auto}h1{font-size:26px;margin:0 0 12px}
p{line-height:1.7;margin:8px 0}button,select{font:inherit;padding:10px 14px;margin:4px;border:1px solid #a99e88;border-radius:6px;background:#fff;color:#282520}
main{padding:0 24px 40px;max-width:1200px;margin:auto}section{padding:18px 0 28px;border-top:1px solid #aaa}h2{font-size:22px;margin:0 0 12px}
.grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}.card{text-align:center;border:1px solid #bfb8a9;border-radius:7px;background:#fffdf7;padding:8px 0;min-width:0}
.dark .card{background:#11161d;border-color:#525a67}.card canvas{width:min(160px,100%);height:auto;aspect-ratio:1}.card small{display:block;font-size:13px;padding:6px 4px}
.comparison{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0 18px}.comparison .card{width:184px}.comparison canvas{width:160px}
.tools{display:flex;flex-wrap:wrap;align-items:center}.warning{color:#805000}.dark .warning{color:#ffd780}.raw-player{display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-bottom:20px}.raw-player canvas{width:160px;height:160px}.dark a{color:#ffd780}a{color:#4a4330}
@media(max-width:700px){header,main{padding-left:12px;padding-right:12px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.card canvas,.comparison canvas,.raw-player canvas{width:120px}.comparison .card{width:144px}h1{font-size:22px}}
</style><header><h1>原版助手 · 补帧素材</h1>
<p>候选素材，不是线上助手，也不是已验收的 15 fps 动作。以下是整个人物绘制，不使用分层拼装；旧 84 张图片保持不变。</p>
<p class="warning">思考图的后段需要筛选、重新编排；哈欠主图实际只有 24 格，另有 12 格收手补图。不同图片字节不代表每张都是不同的解剖姿态。</p>
<div class="tools"><button id="theme">切换浅色 / 深色</button><select id="action" aria-label="素材动作"></select><button id="play">播放素材顺序</button><button id="stop">停止</button></div>
</header><main><div class="raw-player"><div class="card"><canvas id="raw" width="224" height="224"></canvas><small id="raw-label">静态素材</small></div>
<p>可按约 15 张/秒检查原始素材顺序，停止时保留当前图。<br>仅用于发现大小、衣服、手臂和衔接问题；不代表最终动作时间线。</p></div><div id="sheets"></div></main>
<script>
const {manifest,originals}=${data};
const names={idle:'待机眨眼',wave:'挥手',nod:'点头',thinking:'思考','thinking-recovery':'思考收手',bow:'鞠躬',cheer:'开心',yawn:'打哈欠','yawn-recovery':'哈欠收手'};
const loaded=new Map();let ready=false,timer=null,active='wave',frame=0;
async function image(src){if(!loaded.has(src)){const img=new Image();img.src=src;loaded.set(src,new Promise((resolve,reject)=>{img.onload=()=>resolve(img);img.onerror=()=>reject(Error(src))}));}return loaded.get(src)}
async function draw(canvas,sheet,index){const img=await image(sheet.src),[x,y,right,bottom,anchor]=sheet.poses[index].rect;const width=right-x+1,height=bottom-y+1,scale=sheet.scale,ctx=canvas.getContext('2d');
ctx.clearRect(0,0,224,224);ctx.drawImage(img,x,y,width,height,112-(anchor-x)*scale,216-height*scale,width*scale,height*scale);canvas.dataset.src=sheet.src;canvas.dataset.frame=index;
}
function card(section,sheet,index,label){const box=document.createElement('div');box.className='card';const canvas=document.createElement('canvas');canvas.width=canvas.height=224;const text=document.createElement('small');text.textContent=label;box.append(canvas,text);section.append(box);return draw(canvas,sheet,index)}
async function init(){const jobs=[],select=document.querySelector('#action');
for(const [action,sheet] of Object.entries(manifest.sheets)){const option=document.createElement('option');option.value=action;option.textContent=names[action];select.append(option);
const section=document.createElement('section');section.id=action;section.innerHTML='<h2>'+names[action]+' · '+sheet.actualFrames+' 格候选</h2>';
const compare=document.createElement('div');compare.className='comparison';const original=originals[sheet.action];jobs.push(card(compare,original,0,'原版中立参考'));jobs.push(card(compare,sheet,0,'补图第一格'));jobs.push(card(compare,sheet,sheet.poses.length-1,'补图最后一格'));section.append(compare);
const grid=document.createElement('div');grid.className='grid';for(let i=0;i<sheet.poses.length;i++)jobs.push(card(grid,sheet,i,'候选 '+String(i+1).padStart(2,'0')));section.append(grid);document.querySelector('#sheets').append(section)}
select.value=active;await Promise.all(jobs);await draw(document.querySelector('#raw'),manifest.sheets[active],0);ready=true;document.documentElement.dataset.ready='true';
}
function stop(){clearInterval(timer);timer=null;document.querySelector('#raw-label').textContent='静态素材 · '+(frame+1)}
document.querySelector('#theme').onclick=()=>document.body.classList.toggle('dark');
document.querySelector('#action').onchange=async event=>{stop();active=event.target.value;frame=0;await draw(document.querySelector('#raw'),manifest.sheets[active],frame)};
document.querySelector('#play').onclick=()=>{if(!ready)return;stop();let start=performance.now();timer=setInterval(()=>{frame=Math.floor((performance.now()-start)*15/1000)%manifest.sheets[active].poses.length;draw(document.querySelector('#raw'),manifest.sheets[active],frame);document.querySelector('#raw-label').textContent='素材原始顺序 · '+(frame+1)+' / '+manifest.sheets[active].poses.length},1000/15)};
document.querySelector('#stop').onclick=stop;document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
window.review={ready:()=>ready,theme:dark=>document.body.classList.toggle('dark',dark),drawRaw:async(action,index)=>{stop();active=action;frame=index;await draw(document.querySelector('#raw'),manifest.sheets[action],index)},metrics:()=>[...document.querySelectorAll('.grid canvas')].map(canvas=>{
const data=canvas.getContext('2d').getImageData(0,0,224,224).data;let top=224,bottom=-1,left=224,right=-1,footSum=0,footCount=0;for(let y=0;y<224;y++)for(let x=0;x<224;x++)if(data[(y*224+x)*4+3]>100){top=Math.min(top,y);bottom=Math.max(bottom,y);left=Math.min(left,x);right=Math.max(right,x);if(y>=200){footSum+=x;footCount++}}return{src:canvas.dataset.src,frame:Number(canvas.dataset.frame),top,bottom,left,right,footCentre:footSum/footCount,corners:[data[3],data[(223*4)+3],data[(223*224*4)+3],data[(224*224-1)*4+3]]}
})};init().catch(error=>{document.documentElement.dataset.error=error.message;console.error(error)});
</script></html>`;

const server=createServer(async(req,res)=>{
  try{
    if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);return;}
    if(!allowed.has(req.url)){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'});
    res.end(await readFile(resolve(root, 'public'+req.url)));
  }catch{res.writeHead(500);res.end('Preview read failed');}
});
await new Promise(resolve=>server.listen(0, '127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;
if(process.argv.includes('--serve')){
  console.log('Local candidate preview: '+url);
  process.once('SIGINT',()=>server.close());
}else{
  const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const browser=await chromium.launch({headless:true,channel:'msedge'}), errors=[],requests=[],results=[];
  try{
    await mkdir(output,{recursive:true});
    // Portable local review artifact. Its assets stay in public/assistant;
    // no upload, model endpoint, or production application is involved.
    await writeFile(resolve(output,'preview.html'),html.replaceAll('"src":"/assistant/','"src":"../../public/assistant/'));
    for(const width of [1200,390]){
      const page=await browser.newPage({viewport:{width,height:844}});page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
      await page.goto(url);await page.waitForSelector('html[data-ready=true]');
      const metrics=await page.evaluate(()=>window.review.metrics());assert.equal(metrics.length,138);
      for(const p of metrics){assert.ok(p.top>=8 && p.bottom<=216 && p.left>=8 && p.right<216,JSON.stringify(p));assert.ok(p.corners.every(a=>a===0),'Alpha background or neighbouring drawing leaked');assert.ok(Math.abs(p.footCentre-112)<2,'Boot registration drift');}
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Preview horizontally overflows');
      for(const dark of [false,true]){
        await page.evaluate(dark=>window.review.theme(dark),dark);
        for(const action of Object.keys(manifest.sheets))await page.locator('section#'+action).screenshot({path:resolve(output, action+'-'+width+'-'+(dark?'dark':'light')+'.png')});
        await page.screenshot({path:resolve(output, 'overview-'+width+'-'+(dark?'dark':'light')+'.png')});
      }
      await page.locator('#action').selectOption('yawn-recovery');await page.locator('#play').click();
      await page.waitForFunction(()=>Number(document.querySelector('#raw').dataset.frame)>=5);
      await page.locator('#stop').click();const before=await page.locator('#raw').getAttribute('data-frame');
      // Two browser-rendering callbacks prove stopping does not advance a pose.
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.equal(await page.locator('#raw').getAttribute('data-frame'),before);
      results.push({width,sourceFrames:metrics.length,clearCorners:true,fullFigure:true,fixedFeet:true,pause:true,noOverflow:true,metrics});await page.close();
    }
    assert.deepEqual(errors,[]);assert.ok(requests.every(request=>new URL(request).origin===url),'Preview must not contact providers');
    const report={checked:true,visualAcceptance:false,status:'candidate-materials-not-runtime',noProviderOrMicrophoneRequests:true,results};
    await writeFile(resolve(output,'registration-report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({checked:true,visualAcceptance:false,sourceFrames:138,widths:results.map(r=>r.width),output},null,2));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
