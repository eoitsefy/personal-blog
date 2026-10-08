// Real page, local clock and intercepted status; zero AI calls or user writes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {SLEEP_AFTER_MS} from '../src/lib/assistant/presence.ts';
import {SLEEP_LOOP,SLEEP_SHEETS} from '../src/lib/assistant/sleep-sheets.ts';
const base=process.env.TEST_BASE_URL||'http://localhost:3220',out=process.env.CHARACTER_REPORT_DIR||'.tool-tmp/assistant-sleep';
assert.ok(['localhost','127.0.0.1','eastherphil.cn'].includes(new URL(base).hostname));
await mkdir(out,{recursive:true});
const manifest=JSON.parse(await readFile('docs/assistant/sleep-bed-v2/manifest.json','utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const inputs=['src/lib/assistant/presence.ts','src/lib/assistant/sleep-sheets.ts','src/components/assistant/use-assistant-presence.ts','src/components/assistant/sleep-scene.tsx','src/components/assistant/chibi-assistant.tsx','src/components/assistant/assistant-panel.module.css','src/components/assistant/use-assistant-behavior.ts','src/lib/assistant/behavior.ts'];
const codeScopeSha256=hash((await Promise.all(inputs.map(async p=>p+':'+hash((await readFile(p,'utf8')).replace(/\r\n/g,'\n'))))).sort().join('\n'));
const expected=new Map(Object.values(manifest.assets).flatMap(a=>a.pages.map(p=>[p.src,p.sha256])));
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'}),results=[],errors=[];
let realModelQueries=0,fallback=false,mediaNotificationFallback=false;
async function setup(width,dpr=1,suppressMediaNotifications=false){
  const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:dpr}),page=await context.newPage();
  if(suppressMediaNotifications)await page.addInitScript(()=>{
    const original=window.matchMedia.bind(window);
    window.matchMedia=query=>{
      const m=original(query);
      if(query==='(prefers-reduced-motion: reduce)'){
        const add=m.addEventListener.bind(m);
        m.addEventListener=(type,...args)=>{if(type!=='change')add(type,...args);};
      }
      return m;
    };
  });
  await page.clock.install();page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/api/assistant/status',r=>r.fulfill({json:{feature:{enabled:true},limits:{maxQuestionChars:500}}}));
  await context.route('**/api/assistant/query',r=>{realModelQueries++;return r.abort();});
  await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('[data-presence=awake] canvas[data-ready=true]');
  return {context,page};
}
async function ready(page,phase){
  await page.waitForSelector(`[data-presence=${phase}] canvas[data-sleep-ready=true][data-sleep-phase=${phase}]`);
  const duration=(phase==='sleeping'?SLEEP_LOOP.length:phase==='entering'?SLEEP_SHEETS.enter.frames:SLEEP_SHEETS.wake.frames)*1000/24;
  await page.waitForFunction(({phase,duration})=>{
    const el=document.querySelector(`canvas[data-sleep-ready=true][data-sleep-phase=${phase}]`),a=el?.getAnimations()[0];
    return a&&Math.abs(Number(a.effect.getTiming().duration)-duration)<.01;
  },{phase,duration});
}
async function seek(page,phase,position){
  const scene=page.locator(`canvas[data-sleep-phase=${phase}]`);
  const index=phase==='sleeping'?SLEEP_LOOP[position]:position;
  for(let tries=0;tries<8;tries++){
    await scene.evaluate((el,p)=>{const a=el.getAnimations()[0];a.pause();a.currentTime=p*1000/24+.01;},position);
    await scene.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    if(await scene.getAttribute('data-source-frame')===String(index))break;
    await page.waitForTimeout(80);
  }
  assert.equal(await scene.getAttribute('data-source-frame'),String(index));
  return scene.evaluate(el=>{
    const {data}=el.getContext('2d').getImageData(0,0,el.width,el.height),box=el.getBoundingClientRect();
    let left=el.width,right=-1,top=el.height,bottom=-1,count=0;
    for(let y=0;y<el.height;y++)for(let x=0;x<el.width;x++)if(data[(y*el.width+x)*4+3]>100){count++;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    return{bounds:[left,top,right+1,bottom+1],pixels:count,box:{x:box.x,y:box.y,width:box.width,height:box.height},pageCache:Number(el.dataset.cachedPages)};
  });
}
async function finish(page,phase,next){
  await ready(page,phase);
  const count=(phase==='entering'?SLEEP_SHEETS.enter:SLEEP_SHEETS.wake).frames;
  await page.locator(`canvas[data-sleep-phase=${phase}]`).evaluate((el,count)=>{
    const a=el.getAnimations()[0];a.pause();a.currentTime=(count-1)*1000/24+.01;
  },count);
  // Loading the final page may resume the runtime clock and complete the
  // phase before the next test command. Accept only the expected successor.
  await page.waitForFunction(({phase,count})=>{
    const root=document.querySelector('[data-presence]');
    return root?.getAttribute('data-presence')!==phase||document.querySelector(`canvas[data-sleep-phase=${phase}]`)?.getAttribute('data-source-frame')===String(count-1);
  },{phase,count});
  if(await page.locator('[data-presence]').getAttribute('data-presence')===phase){
    await page.locator('canvas[data-sleep-ready=true]').evaluate((el,{phase,count})=>{
      const a=el.getAnimations()[0];
      if(el.dataset.sleepPhase===phase&&a&&Math.abs(Number(a.effect.getTiming().duration)-count*1000/24)<.01)a.finish();
    },{phase,count});
  }
  await page.waitForSelector(`[data-presence=${next}]`);
}
try{
  for(const[width,dpr]of[[1280,1],[768,1],[390,2],[320,2]]){
    const {context,page}=await setup(width,dpr),checks=[],received=new Map();
    page.on('response',r=>{const path=new URL(r.url()).pathname;if(expected.has(path))checks.push((async()=>{assert.equal(r.status(),200);const actual=hash(await r.body());assert.equal(actual,expected.get(path));received.set(path,actual);})().catch(e=>errors.push(e.message)));});
    const launcher=page.getByRole('button',{name:'打开小助手对话'});
    await launcher.click();await page.waitForSelector('dialog[open] canvas[data-ready=true]');
    await page.clock.fastForward(SLEEP_AFTER_MS*2);assert.equal(await page.locator('[data-presence]').getAttribute('data-presence'),'awake');
    await page.getByRole('button',{name:'关闭小助手对话'}).click();
    await page.clock.fastForward(75_050);await page.waitForSelector('[data-presence=awake] canvas[data-playing=yawn]');
    await page.locator('[data-presence=awake] canvas').evaluate(el=>el.getAnimations()[0].finish());
    await page.clock.fastForward(45_050);await ready(page,'entering');
    const fixed=await page.locator('canvas[data-sleep-ready=true]').boundingBox();
    let positions=0,maxCache=0;
    for(const[phase,count]of[['entering',193],['sleeping',96],['waking',121]]){
      if(phase==='sleeping'){await finish(page,'entering','sleeping');await ready(page,'sleeping');}
      if(phase==='waking'){await page.getByRole('button',{name:'唤醒小助手'}).click();await ready(page,'waking');assert.equal(await page.locator('dialog[open]').count(),0);}
      for(let p=0;p<count;p++){
        const sample=await seek(page,phase,p);positions++;assert.ok(sample.pixels>500);assert.ok(sample.pageCache<=2);maxCache=Math.max(maxCache,sample.pageCache);
        assert.ok(Math.abs(sample.box.x-fixed.x)<.02&&Math.abs(sample.box.y-fixed.y)<.02,'Scene viewport moved');
        if(phase==='sleeping'){
          const [left,top,right,bottom]=sample.bounds,scale=sample.box.width/(await page.locator('canvas[data-sleep-ready=true]').evaluate(el=>el.width));
          assert.ok(sample.box.x+left*scale>=4&&sample.box.x+right*scale<=width-4,'Sleeping bed leaves viewport');
          assert.ok(sample.box.y+top*scale>=0&&sample.box.y+bottom*scale<=844-35,'Bed overlaps wake label');
        }
      }
      await page.screenshot({path:`${out}/${phase}-${width}.png`});
      if(phase==='sleeping'){
        await page.clock.fastForward(3_600_000);assert.equal(await page.locator('[data-presence]').getAttribute('data-presence'),'sleeping');
        await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
        assert.equal(await page.locator('canvas[data-sleep-ready=true]').evaluate(el=>el.getAnimations()[0].playState),'paused');
        await page.clock.fastForward(3_600_000);assert.equal(await page.locator('[data-presence]').getAttribute('data-presence'),'sleeping');
        await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
      }
    }
    await finish(page,'waking','recovering');await page.waitForSelector('[data-presence=recovering] canvas[data-playing=yawn]');
    await page.locator('[data-presence=recovering] canvas').evaluate(el=>el.getAnimations()[0].finish());
    await page.waitForSelector('[data-presence=awake] canvas[data-ready=true][data-playing=idle]');
    await page.clock.fastForward(SLEEP_AFTER_MS+50);await ready(page,'entering');
    await seek(page,'entering',48);
    await page.getByRole('button',{name:'唤醒小助手'}).click();assert.equal(await page.locator('[data-presence]').getAttribute('data-presence'),'entering');assert.equal(await page.locator('dialog[open]').count(),0);
    await finish(page,'entering','waking');await ready(page,'waking');
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForSelector('[data-presence=awake] canvas[data-ready=true]');
    await page.clock.fastForward(SLEEP_AFTER_MS*3);assert.equal(await page.locator('[data-presence]').getAttribute('data-presence'),'awake');
    await page.getByRole('button',{name:'打开小助手对话'}).click();await page.waitForSelector('dialog[open]');
    await Promise.all(checks);assert.deepEqual([...received.keys()].sort(),[...expected.keys()].sort());
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    results.push({width,dpr,positions,maxCache,dialogPreventsSleep:true,yawnBeforeSleep:true,indefiniteSleep:true,clickWakesWithoutQuery:true,hiddenTabPaused:true,queuedWake:true,reducedMotion:true,resources:Object.fromEntries(received)});
    await context.close();
  }
  {
    // A just-created MediaQueryList can update before its change notification.
    // The renderer must still settle safely when that notification is missed.
    const {context,page}=await setup(390,2,true);
    await page.clock.fastForward(SLEEP_AFTER_MS+50);await ready(page,'entering');await seek(page,'entering',48);
    await page.getByRole('button',{name:'唤醒小助手'}).click();await finish(page,'entering','waking');await ready(page,'waking');
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForSelector('[data-presence=awake] canvas[data-ready=true]');
    await page.clock.fastForward(SLEEP_AFTER_MS*3);assert.equal(await page.locator('[data-presence]').getAttribute('data-presence'),'awake');
    await page.getByRole('button',{name:'打开小助手对话'}).click();await page.waitForSelector('dialog[open]');mediaNotificationFallback=true;
    await context.close();
  }
  {
    const {context,page}=await setup(390,2);
    let failedRequests=0;
    page.on('requestfailed',r=>{if(new URL(r.url()).pathname.startsWith('/assistant/chibi-sleep-enter-'))failedRequests++;});
    await context.route('**/assistant/chibi-sleep-enter-*.webp',r=>r.abort());
    await page.clock.fastForward(SLEEP_AFTER_MS+50);
    await page.waitForFunction(()=>!document.querySelector('[data-presence=entering]'));
    assert.ok(failedRequests>0);
    await page.waitForSelector('[data-presence=awake] canvas[data-ready=true]');
    await page.getByRole('button',{name:'打开小助手对话'}).click();await page.waitForSelector('dialog[open]');fallback=true;
    await context.close();
  }
  assert.equal(realModelQueries,0);assert.deepEqual(errors,[]);
  const report={accepted:true,testedBaseUrl:base,completedAt:new Date().toISOString(),artVersion:manifest.version,assetScopeSha256:manifest.assetScopeSha256,frameScopeSha256:manifest.frameScopeSha256,codeScopeSha256,inputs,realModelQueries,fallback,mediaNotificationFallback,results,limitations:['Headless Edge is not a physical mobile-device performance test.','Synthetic visibility uses the same browser visibility event handler.']};
  await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({accepted:true,widths:results.map(r=>r.width),positions:results.map(r=>r.positions),realModelQueries}));
}catch(error){
  const states=[];
  for(const context of browser.contexts())for(const page of context.pages()){
    states.push(await page.locator('[data-presence]').evaluateAll(elements=>elements.map(el=>({phase:el.getAttribute('data-presence'),hidden:document.hidden,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,canvases:[...el.querySelectorAll('canvas')].map(c=>({data:{...c.dataset},clock:c.getAnimations()[0]?.playState,currentTime:c.getAnimations()[0]?.currentTime,duration:c.getAnimations()[0]?.effect.getTiming().duration}))}))).catch(()=>[]));
    await page.screenshot({path:`${out}/failure-${states.length-1}.png`}).catch(()=>{});
  }
  await writeFile(out+'/failure.json',JSON.stringify({testedBaseUrl:base,failedAt:new Date().toISOString(),codeScopeSha256,message:error.message,stack:error.stack,errors,states,results},null,2));throw error;
}
finally{await browser.close();}
