// Real application UI, intercepted test answers, no provider calls or microphone.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DRAWING_SEQUENCES,CHARACTER_FRAME_VERSION,NEUTRAL_DRAWING,drawingKey,drawingTimes} from '../src/lib/assistant/frame-timeline.ts';
import {ASSISTANT_BEHAVIOR_VERSION,BEHAVIOR_TIMING} from '../src/lib/assistant/behavior.ts';

const base=process.env.TEST_BASE_URL||'http://localhost:3220';
if(!['localhost','127.0.0.1','eastherphil.cn'].includes(new URL(base).hostname))throw Error('Unexpected target');
const output=process.env.CHARACTER_REPORT_DIR||'.tool-tmp/assistant-behavior';
await mkdir(output,{recursive:true});
const manifest=JSON.parse(await readFile('docs/assistant/kling-actions-v2/manifest.json','utf8'));
const assets=[...Object.values(manifest.assets),...Object.values(manifest.keptAssets)];
const hash=b=>createHash('sha256').update(b).digest('hex');
const behaviorInputs=['src/lib/assistant/behavior.ts','src/components/assistant/use-assistant-behavior.ts','src/components/assistant/chibi-assistant.tsx','src/components/assistant/assistant-panel.module.css'];
const behaviorCodeScopeSha256=hash((await Promise.all(behaviorInputs.map(async p=>`${p}:${hash((await readFile(p,'utf8')).replace(/\r\n/g,'\n'))}`))).sort().join('\n'));
const expected=new Map(assets.map(a=>[a.src,a.sha256]));
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'}),results=[],errors=[];
let mockedQueries=0;
const summary=(mode='conversation',confidence='high')=>({answer:'模拟验收回答',mode,confidence,sources:[]});

async function inspect(canvas,time){
  await canvas.evaluate((el,t)=>{const a=el.getAnimations()[0];assertClock(a);a.pause();a.currentTime=t;function assertClock(a){if(!a)throw Error('No action clock');}},time);
  await canvas.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  return canvas.evaluate(el=>{
    const {data}=el.getContext('2d').getImageData(0,0,el.width,el.height),ratio=el.width/224;
    let top=el.height,bottom=-1,left=el.width,right=-1,fl=el.width,fr=-1,alphaHash=0;
    for(let y=0;y<el.height;y++)for(let x=0;x<el.width;x++)if(data[(y*el.width+x)*4+3]>100){top=Math.min(top,y);bottom=Math.max(bottom,y);left=Math.min(left,x);right=Math.max(right,x);}
    for(let y=Math.ceil(190*ratio);y<=bottom;y++)for(let x=left;x<=right;x++)if(data[(y*el.width+x)*4+3]>100){fl=Math.min(fl,x);fr=Math.max(fr,x);}
    for(let i=3;i<data.length;i+=4)alphaHash=(alphaHash*31+data[i])|0;
    return{pose:el.dataset.pose,alphaHash,top:top/ratio,bottom:(bottom+1)/ratio,left:left/ratio,right:(right+1)/ratio,footCentre:(fl+fr+1)/2/ratio,image:el.toDataURL()};
  });
}
async function ready(page,action){await page.waitForSelector(`dialog canvas[data-ready=true][data-loaded-action=${action}][data-playing=${action}]`);}
async function finish(page,canvas){await canvas.evaluate(el=>{const a=el.getAnimations()[0];if(a&&el.dataset.playing!=='idle')a.finish();});await ready(page,'idle');}

try{
  for(const [width,dpr] of [[1280,1],[768,1],[390,2],[320,2]]){
    const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:dpr}),page=await context.newPage();
    await page.clock.install();
    page.on('pageerror',e=>errors.push(e.message));
    const received=new Set(),responseChecks=[],gallery=[];
    page.on('response',response=>{const p=new URL(response.url()).pathname;if(expected.has(p))responseChecks.push((async()=>{
      if(response.status()===304){assert.ok(received.has(p));return;}
      assert.equal(response.status(),200);assert.equal(hash(await response.body()),expected.get(p));received.add(p);
    })().catch(e=>errors.push(e.message)));});
    let plan=summary(),held=null;
    await context.route('**/api/assistant/status',route=>route.fulfill({json:{feature:{enabled:true},limits:{maxQuestionChars:500}}}));
    await context.route('**/api/assistant/query',async route=>{
      mockedQueries++;
      if(plan==='held'){held=route;return;}
      await route.fulfill({status:plan.error?503:200,json:plan.error?{success:false,error:{message:'模拟服务暂不可用'}}:{success:true,data:plan}});
    });
    // Validate the assistant's explicit ready gates, not unrelated page media.
    await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:60_000});
    assert.equal(await page.locator('[data-behavior-version]').getAttribute('data-behavior-version'),ASSISTANT_BEHAVIOR_VERSION);
    await page.waitForSelector('[data-behavior-version] canvas[data-ready=true][data-loaded-action=idle]');
    const launcher=page.getByRole('button',{name:'打开小助手对话'});
    await launcher.click();const dialog=page.getByRole('dialog'),canvas=dialog.locator('canvas');
    await ready(page,'wave');
    assert.equal(await dialog.getByRole('button',{name:/播放.*动作|让小助手点头/}).count(),0);
    assert.equal(await dialog.locator('[aria-label="助手动作"]').count(),0);
    assert.equal(await dialog.locator('[data-motion-source]').getAttribute('data-motion-source'),'automatic');
    const character=dialog.locator('[data-engine=frames]'),box=await character.boundingBox();
    let checked=0,maxDrift=0;
    async function submit(question,result){
      plan=result;held=null;
      await dialog.getByRole('button',{name:'清空对话'}).click();await ready(page,'idle');
      await page.clock.fastForward(BEHAVIOR_TIMING.responseCooldown+50);
      await dialog.getByRole('textbox',{name:'你的问题'}).fill(question);
      await dialog.getByRole('button',{name:'发送 ↗'}).click();
    }
    for(const action of ['wave','idle','nod','thinking','bow','cheer','yawn']){
      if(action==='nod')await submit('你好',summary());
      if(action==='thinking'){
        await submit('请帮我查找文章','held');
        await page.waitForFunction(()=>document.querySelector('dialog [role=status]')?.textContent?.includes('正在查找'));
        await page.clock.fastForward(BEHAVIOR_TIMING.thinkingDelay+50);
      }
      if(action==='bow')await submit('谢谢你',summary());
      if(action==='cheer')await submit('太好了',summary());
      if(action==='yawn'){
        await dialog.getByRole('button',{name:'清空对话'}).click();await ready(page,'idle');
        await page.clock.fastForward(BEHAVIOR_TIMING.idleDelay+50);
      }
      await ready(page,action);
      assert.equal(await canvas.evaluate(el=>el.getAnimations()[0].effect.getTiming().iterations),action==='idle'?Infinity:1);
      const neutral=await inspect(canvas,0),seen=[];
      for(const [i,time] of drawingTimes(action).entries()){
        const p=await inspect(canvas,time+1);seen.push(p.pose);checked++;
        assert.ok(p.top>=7&&p.bottom<=217&&p.left>=8&&p.right<=216,`${action}/${i}: clipping or atlas bleed`);
        maxDrift=Math.max(maxDrift,Math.abs(p.footCentre-112));assert.ok(Math.abs(p.footCentre-112)<=1.25);
        assert.ok(Number(await canvas.getAttribute('data-cached-poses'))<=8);
        assert.deepEqual(await character.boundingBox(),box);
        if(width===1280)gallery.push({action,frame:i,src:p.pose,image:p.image});
      }
      assert.deepEqual(seen,DRAWING_SEQUENCES[action].map(drawingKey));
      assert.equal((await inspect(canvas,drawingTimes(action).at(-1)+1)).alphaHash,neutral.alphaHash);
      if(action==='idle'){await canvas.evaluate(el=>el.getAnimations()[0].play());continue;}
      await finish(page,canvas);
      if(action==='thinking'){
        // The test response is held locally, never sent to the provider.
        assert.ok(held);await held.fulfill({json:{success:true,data:summary('no_evidence','low')}});held=null;
        await page.waitForFunction(()=>document.querySelector('dialog button[type=submit]')?.textContent?.includes('发送'));
      }
    }
    // Pause, foreground resume, aborted requests and failure reactions.
    await dialog.getByRole('button',{name:'暂停动作'}).click();
    await page.waitForFunction(()=>document.querySelector('dialog canvas')?.getAnimations().length===0);
    await page.clock.fastForward(BEHAVIOR_TIMING.yawnCooldown+1);
    assert.equal(await canvas.getAttribute('data-pose'),drawingKey(NEUTRAL_DRAWING));
    await dialog.getByRole('button',{name:'开启动作'}).click();await ready(page,'idle');
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForFunction(()=>document.querySelector('dialog canvas')?.getAnimations().length===0);
    await page.clock.fastForward(BEHAVIOR_TIMING.idleDelay+1);
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await ready(page,'idle');
    await submit('测试错误',{error:true});
    await dialog.getByRole('alert').waitFor();await ready(page,'idle');
    assert.equal(await dialog.getByRole('textbox',{name:'你的问题'}).inputValue(),'测试错误');
    await submit('取消这次查询','held');await page.clock.fastForward(BEHAVIOR_TIMING.thinkingDelay+50);await ready(page,'thinking');
    await dialog.getByRole('button',{name:'关闭小助手对话'}).click();assert.equal(await dialog.isVisible(),false);
    await held.abort().catch(()=>{});held=null;
    assert.equal(await launcher.evaluate(el=>el===document.activeElement),true);
    await launcher.click();await ready(page,'idle');
    assert.equal(await dialog.locator('[role=status]').filter({hasText:'正在查找'}).count(),0);
    await dialog.getByRole('button',{name:'清空对话'}).click();await ready(page,'idle');
    await page.screenshot({path:`${output}/dialog-${width}.png`});
    assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);
    assert.equal(await launcher.evaluate(el=>el===document.activeElement),true);
    if(width===1280){
      const review=await context.newPage();await review.setContent('<style>body{margin:0;background:#f5f1e7;font:14px system-ui}.grid{display:grid;grid-template-columns:repeat(6,160px);gap:8px;padding:8px}figure{margin:0;text-align:center;background:#fffdf5}img{width:160px;height:160px}body.dark{background:#171c23;color:#fff}body.dark figure{background:#10141b}</style><div class="grid"></div>');
      for(const action of Object.keys(DRAWING_SEQUENCES)){
        await review.evaluate(items=>{document.querySelector('.grid').replaceChildren(...items.map(p=>{const f=document.createElement('figure'),img=document.createElement('img'),label=document.createElement('p');img.src=p.image;label.textContent=`${p.action} ${p.frame} · ${p.src}`;f.append(img,label);return f;}));},gallery.filter(p=>p.action===action));
        for(const dark of [false,true]){await review.evaluate(d=>document.body.classList.toggle('dark',d),dark);await review.locator('.grid').screenshot({path:`${output}/${action}-${dark?'dark':'light'}.png`});}
      }await review.close();
    }
    await Promise.all(responseChecks);
    assert.equal(checked,Object.values(DRAWING_SEQUENCES).reduce((n,s)=>n+s.length,0));
    assert.deepEqual([...received].sort(),assets.filter(a=>!a.src.endsWith('.png')).map(a=>a.src).sort());
    results.push({width,dpr,poses:checked,persistentCanvas:true,sharedNeutral:true,fixedViewport:true,maxBootMidpointDrift:maxDrift,actualAssetHashesVerified:true,resourceSha256:Object.fromEntries([...received].sort().map(p=>[p,expected.get(p)])),automaticActions:true,thinkingOneShot:true,pause:true,syntheticVisibility:true,requestCancellation:true,errorNeutral:true,focusRestored:true});
    await context.close();console.log(`width=${width} automatic events and ${checked} native positions passed`);
  }
  const reduced=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),r=await reduced.newPage();
  await reduced.route('**/api/assistant/status',route=>route.fulfill({json:{feature:{enabled:true},limits:{maxQuestionChars:500}}}));
  await r.goto(base+'/',{waitUntil:'domcontentloaded',timeout:60_000});await r.waitForSelector('[data-behavior-version] canvas[data-ready=true]');await r.getByRole('button',{name:'打开小助手对话'}).click();await r.waitForSelector('dialog canvas[data-ready=true]');
  assert.equal(await r.locator('dialog canvas').evaluate(el=>el.getAnimations().length),0);await reduced.close();
  const fallback=await browser.newContext();await fallback.route('**'+manifest.keptAssets.idle.src,route=>route.abort());
  const f=await fallback.newPage();await f.goto(base+'/',{waitUntil:'domcontentloaded',timeout:60_000});await f.waitForSelector('img[src*="chibi-neutral-left-collar-v4"]');
  await f.locator('img[src*="chibi-neutral-left-collar-v4"]').evaluate(async img=>{await img.decode();if(!img.naturalWidth)throw Error('Fallback decode failed');});
  await f.getByRole('button',{name:'打开小助手对话'}).click();
  await f.waitForSelector('dialog [data-engine=frames][data-action=idle] img');
  const response=await fallback.request.get(base+manifest.keptAssets.fallback.src);assert.equal(response.status(),200);const fallbackSha256=hash(await response.body());assert.equal(fallbackSha256,manifest.keptAssets.fallback.sha256);await fallback.close();
  assert.deepEqual(errors,[]);
  const report={accepted:true,testedBaseUrl:base,completedAt:new Date().toISOString(),characterVersion:CHARACTER_FRAME_VERSION,behaviorVersion:ASSISTANT_BEHAVIOR_VERSION,behaviorCodeScopeSha256,assetScopeSha256:manifest.assetScopeSha256,frameScopeSha256:manifest.frameScopeSha256,actualAssetHashesVerified:true,noAIRequests:true,mockedQueries,realModelQueries:0,manualActionControls:false,reducedMotion:true,fallback:true,fallbackDecoded:true,fallbackBehaviorSettled:true,fallbackSha256,bitmapCacheLimit:8,results,timingScope:'Deterministic policy timers advanced with Playwright clock and native drawing positions sought. Not a physical-device FPS benchmark.'};
  await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){
  const states=[];
  for(const context of browser.contexts())for(const page of context.pages()){
    const index=states.length;
    states.push({url:page.url(),characters:await page.locator('[data-engine=frames]').evaluateAll(elements=>elements.map(el=>({action:el.dataset.action,canvas:el.querySelector('canvas')?.dataset,fallback:!!el.querySelector('img')}))).catch(()=>[])});
    await page.screenshot({path:`${output}/failure-${index}.png`}).catch(()=>{});
  }
  await writeFile(`${output}/failure.json`,JSON.stringify({testedBaseUrl:base,behaviorCodeScopeSha256,failedAt:new Date().toISOString(),mockedQueries,error:String(error),pageErrors:errors,results,states},null,2));
  throw error;
}finally{await browser.close();}
