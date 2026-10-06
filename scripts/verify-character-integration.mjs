// node --import tsx scripts/verify-character-integration.mjs; no AI or microphone.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CHARACTER_ACTIONS} from '../src/lib/assistant/character.ts';
import {CHARACTER_FRAME_VERSION,DRAWING_SEQUENCES,NEUTRAL_DRAWING,isPilotAction,drawingKey,drawingTimes,FRAME_BLEND_MS} from '../src/lib/assistant/frame-timeline.ts';
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:3220';
const manifest=JSON.parse(await readFile('docs/assistant/blink-refinement-v1/candidate.json','utf8'));
const assets=[manifest.asset,...Object.values(manifest.keptAssets)];
const expectedHashes=new Map(assets.map(a=>[a.src,a.sha256]));
const hash=b=>createHash('sha256').update(b).digest('hex');
const assetScopeSha256=hash(assets.map(a=>a.src+':'+a.sha256).sort().join('\n'));
const expectedPoses=Object.values(DRAWING_SEQUENCES).reduce((n,seq)=>n+seq.length,0);
if(!['localhost','127.0.0.1','eastherphil.cn'].includes(new URL(base).hostname))throw Error('Unexpected target');
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'}),results=[],errors=[];
const output=process.env.CHARACTER_REPORT_DIR || '.tool-tmp/chibi-integration';await mkdir(output,{recursive:true});
const playback=[];
async function seek(canvas,time){
 await canvas.evaluate((el,t)=>{const a=el.getAnimations()[0];a.pause();a.currentTime=t;},time);
 await canvas.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 return canvas.evaluate(el=>{
  const {data}=el.getContext('2d').getImageData(0,0,el.width,el.height),ratio=el.width/224;
  let top=el.height,bottom=-1,left=el.width,right=-1,fl=el.width,fr=-1;
  for(let y=0;y<el.height;y++)for(let x=0;x<el.width;x++)if(data[(y*el.width+x)*4+3]>100){top=Math.min(top,y);bottom=Math.max(bottom,y);left=Math.min(left,x);right=Math.max(right,x);}
  // A fixed sole band must not change when the head bows or nods.
  for(let y=Math.ceil(190*ratio);y<=bottom;y++)for(let x=left;x<=right;x++)if(data[(y*el.width+x)*4+3]>100){fl=Math.min(fl,x);fr=Math.max(fr,x);}
  // Readback may switch GPU/CPU and round a few RGB values by one level. Alpha
  // is the exact spatial silhouette and must not change at action boundaries.
  let alphaHash=0;for(let i=3;i<data.length;i+=4)alphaHash=(alphaHash*31+data[i])|0;
  return{top:top/ratio,bottom:(bottom+1)/ratio,left:left/ratio,right:(right+1)/ratio,footCentre:(fl+fr+1)/2/ratio,pose:el.dataset.pose,blend:Number(el.dataset.blend),alphaHash,image:el.toDataURL()};
 });
}
try{
 for(const [width,dpr] of [[1280,1],[768,1],[390,2],[320,2]]){
  const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:dpr}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));const requested=new Set(),rigRequests=[],responseChecks=[],received=new Set();let queries=0;
  page.on('response',response=>{const p=new URL(response.url()).pathname;if(expectedHashes.has(p))responseChecks.push((async()=>{
   // A revalidated 304 reuses a body verified earlier in this same context;
   // it must never authorize a resource whose first 200 response was not hashed.
   if(response.status()===304){assert.ok(received.has(p),'Unverified cached artwork: '+p);return;}
   assert.equal(response.status(),200);assert.equal(hash(await response.body()),expectedHashes.get(p),'Browser received unapproved artwork: '+p);received.add(p);
  })().catch(e=>{errors.push(e.message);}));});
  page.on('request',r=>{const p=new URL(r.url()).pathname;if(/chibi-.*\.(png|webp)$/.test(p))requested.add(p);if(/rig-.*\.png$/.test(p))rigRequests.push(p);if(p==='/api/assistant/query')queries++;});
  await page.goto(base);await page.waitForSelector('[data-action] canvas[data-ready=true]');
  const floating=page.locator('[data-action]').first();assert.equal(await floating.evaluate(el=>getComputedStyle(el).transform),'none');
  assert.equal(await floating.evaluate(el=>{const b=el.getBoundingClientRect();return el.closest('button').contains(document.elementFromPoint(b.left+5,b.top+b.height/2));}),false);
  await page.getByRole('button',{name:'打开小助手对话',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'小助手',exact:true}),character=dialog.locator('[data-action]'),canvas=character.locator('canvas');
  await page.waitForSelector('dialog canvas[data-ready=true]');
  assert.equal(await character.getAttribute('data-character-version'),CHARACTER_FRAME_VERSION);
  assert.deepEqual([...requested].sort(),[manifest.asset.src]);
  await canvas.evaluate(el=>{el.dataset.instance='persistent-canvas';});
  const box=await character.boundingBox(),neutral=await seek(canvas,0),gallery=[];let checked=0,maxDrift=0;
  if(width===1280){
   // Run the actual animation clock, in addition to deterministic per-pose seeks.
   for(const [rate,loops]of[[1,3],[.5,1]]){
    const observed=await canvas.evaluate(async(el,{rate,loops})=>{
     const a=el.getAnimations()[0];a.playbackRate=rate;a.currentTime=0;a.play();
     const changes=[];let previous='',last=performance.now(),maxPaintGap=0;
     await new Promise(resolve=>{function sample(now){maxPaintGap=Math.max(maxPaintGap,now-last);last=now;const time=Number(a.currentTime??0),pose=el.dataset.pose;if(pose!==previous){changes.push({time,pose});previous=pose;}if(time>=loops*4000){a.pause();resolve();}else requestAnimationFrame(sample);}requestAnimationFrame(sample);});
     return{rate,loops,maxPaintGap,stopTime:Number(a.currentTime),changes};
    },{rate,loops});
    for(let cycle=0;cycle<loops;cycle++)for(let i=0;i<manifest.indices.length;i++)if(manifest.indices[i]>=36&&manifest.indices[i]<=50)assert.ok(observed.changes.some(p=>p.time>=cycle*4000&&p.time<(cycle+1)*4000&&p.pose===`pilot-blink:${i}`),'Real playback skipped a blink sample');
    playback.push(observed);
   }
  }
  for(const action of Object.keys(DRAWING_SEQUENCES)){
   if(action!=='idle')await dialog.getByRole('button',{name:`播放${CHARACTER_ACTIONS[action].label}动作`}).click();
   await page.waitForSelector(`dialog canvas[data-ready=true][data-loaded-action=${action}]`);
   assert.equal(await canvas.getAttribute('data-instance'),'persistent-canvas');
   assert.equal((await seek(canvas,0)).alphaHash,neutral.alphaHash,'Exact neutral silhouette required');
   const times=drawingTimes(action),seen=[];
   for(let i=0;i<times.length;i++){
    const p=await seek(canvas,times[i]+FRAME_BLEND_MS+1);seen.push(p.pose);checked++;
    assert.ok(Number(await canvas.getAttribute('data-cached-poses'))<=8,'Display bitmap cache exceeds mobile budget');
    assert.ok(p.top>=7 && p.bottom<=217 && p.left>=8 && p.right<=216,`${action}/${i}: clipped or adjacent art ${JSON.stringify({...p,image:undefined})}`);
    maxDrift=Math.max(maxDrift,Math.abs(p.footCentre-112));assert.ok(Math.abs(p.footCentre-112)<=1.25,`${action}/${i}: boot midpoint drift (${p.footCentre})`);
    assert.deepEqual(await character.boundingBox(),box);
    if(width===1280)gallery.push({action,frame:i,src:p.pose,image:p.image});
   }
   assert.deepEqual(seen,DRAWING_SEQUENCES[action].map(drawingKey));
   assert.equal((await seek(canvas,times.at(-1)+FRAME_BLEND_MS+1)).alphaHash,neutral.alphaHash,'Exact neutral ending required');
   assert.ok(Math.abs((await seek(canvas,times[1]+FRAME_BLEND_MS/2)).blend-(isPilotAction(action)?1:.5))<.001);
   if(!CHARACTER_ACTIONS[action].loop){await canvas.evaluate(el=>el.getAnimations()[0].finish());await page.waitForFunction(()=>document.querySelector('dialog canvas')?.dataset.playing==='idle');}
  }
  for(const action of ['wave','bow','yawn','nod'])await dialog.getByRole('button',{name:`播放${CHARACTER_ACTIONS[action].label}动作`}).click();
  await page.waitForSelector('dialog canvas[data-ready=true][data-loaded-action=nod]');assert.equal(await canvas.getAttribute('data-instance'),'persistent-canvas');
  await dialog.getByRole('button',{name:'暂停动作'}).click();await page.waitForSelector('dialog canvas[data-ready=true]');
  assert.equal(await canvas.evaluate(el=>el.getAnimations().length),0);assert.equal(await canvas.getAttribute('data-pose'),drawingKey(NEUTRAL_DRAWING));
  await page.screenshot({path:`${output}/dialog-${width}.png`});assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth));
  await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);
  await page.goto(base+'/assistant');await page.waitForSelector('canvas[data-ready=true]');
  const physical=await page.locator('canvas').evaluate(el=>({actual:el.width,expected:Math.round(Math.min(3,Math.max(.5,el.getBoundingClientRect().width*devicePixelRatio/224))*224)}));assert.equal(physical.actual,physical.expected);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(rigRequests,[]);assert.equal(queries,0);
  if(width===1280){
   const review=await context.newPage();await review.setContent('<style>body{margin:0;background:#f5f1e7;font:14px system-ui}.grid{display:grid;grid-template-columns:repeat(6,160px);gap:8px;padding:8px}figure{margin:0;text-align:center;background:#fffdf5}img{width:160px;height:160px}body.dark{background:#171c23;color:#fff}body.dark figure{background:#10141b}</style><div class="grid"></div>');
   for(const action of Object.keys(DRAWING_SEQUENCES)){
    await review.evaluate(items=>{document.querySelector('.grid').replaceChildren(...items.map(p=>{const f=document.createElement('figure'),img=document.createElement('img'),label=document.createElement('p');img.src=p.image;label.textContent=`${p.action} ${p.frame} · ${p.src}`;f.append(img,label);return f;}));},gallery.filter(p=>p.action===action));
    for(const dark of [false,true]){await review.evaluate(d=>document.body.classList.toggle('dark',d),dark);await review.locator('.grid').screenshot({path:`${output}/${action}-${dark?'dark':'light'}.png`});}
   }await review.close();
  }
  await Promise.all(responseChecks);assert.equal(checked,expectedPoses);
  for(const p of requested)assert.ok(expectedHashes.has(p),'Unreviewed character resource requested: '+p);
  assert.deepEqual([...received].sort(),assets.filter(a=>!a.src.endsWith('.png')).map(a=>a.src).sort());
  results.push({width,dpr,poses:checked,sharedNeutral:true,persistentCanvas:true,maxBootMidpointDrift:maxDrift,fixedViewport:true,hiDpi:true,actualAssetHashesVerified:true,resourceSha256:Object.fromEntries([...received].sort().map(p=>[p,expectedHashes.get(p)]))});await context.close();
 }
 const reduced=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await reduced.newPage();await page.goto(base+'/assistant');await page.waitForSelector('canvas[data-ready=true]');assert.equal(await page.locator('canvas').evaluate(el=>el.getAnimations().length),0);assert.equal(await page.locator('canvas').getAttribute('data-pose'),drawingKey(NEUTRAL_DRAWING));await reduced.close();
 const fallback=await browser.newContext();await fallback.route('**'+manifest.asset.src,r=>r.abort());const f=await fallback.newPage();await f.goto(base+'/assistant');await f.waitForSelector('img[src*="chibi-neutral-left-collar-v4"]');
 await f.locator('img[src*="chibi-neutral-left-collar-v4"]').evaluate(async img=>{await img.decode();if(!(img.naturalWidth>0&&img.naturalWidth===img.naturalHeight))throw Error('Fallback artwork did not decode');});
 const fallbackResponse=await fallback.request.get(base+manifest.keptAssets.fallback.src);assert.equal(fallbackResponse.status(),200);const fallbackSha256=hash(await fallbackResponse.body());assert.equal(fallbackSha256,manifest.keptAssets.fallback.sha256);await fallback.close();
 assert.deepEqual(errors,[]);const report={accepted:true,characterVersion:CHARACTER_FRAME_VERSION,assetScopeSha256,frameScopeSha256:manifest.frameScopeSha256,noAIRequests:true,reducedMotion:true,fallback:true,fallbackDecoded:true,fallbackSha256,bitmapCacheLimit:8,actualAssetHashesVerified:true,playback,results};await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,playback:playback.map(p=>({...p,changes:p.changes.length}))},null,2));
}finally{await browser.close();}
