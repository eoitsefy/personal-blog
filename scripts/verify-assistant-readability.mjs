// Local-only, database-free visual acceptance; no model requests or browser permissions.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {DRAWING_SEQUENCES,drawingTimes,drawingKey,FRAME_BLEND_MS} from '../src/lib/assistant/frame-timeline.ts';
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:3220';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw Error('Local test only');
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'}),results=[],errors=[];
const folder='.tool-tmp/chibi-previews';await mkdir(folder,{recursive:true});
try {
  for(const [width,scale] of [[1280,1],[1280,.9],[1280,.8],[1280,2],[390,1],[320,1]]) {
    console.log(`Checking ${width}px at emulated zoom ${scale}`);
    // Browser-zoom emulation: same physical viewport, changed CSS viewport and pixel density.
    const cssWidth=Math.round(width/scale),cssHeight=Math.round(844/scale);
    const context=await browser.newContext({viewport:{width:cssWidth,height:cssHeight},deviceScaleFactor:scale});
    await context.route('**/api/assistant/status',r=>r.fulfill({json:{feature:{enabled:true},limits:{maxQuestionChars:500}}}));
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);
    const trigger=page.getByRole('button',{name:'打开小助手对话',exact:true});
    await trigger.scrollIntoViewIfNeeded();
    const frame=trigger.locator('[data-action]');
    await page.waitForSelector('[data-action] canvas[data-ready=true]');
    assert.ok((await frame.boundingBox()).width>=(cssWidth>600?180:128));
    assert.equal(await frame.evaluate(el=>getComputedStyle(el).transform),'none');
    assert.equal(await frame.evaluate(el=>{const b=el.getBoundingClientRect(),hit=document.elementFromPoint(b.left+5,b.top+b.height/2);return el.closest('button').contains(hit);}),false,'Transparent mascot gutter must pass taps through');
    assert.equal(await frame.evaluate(el=>{const b=el.getBoundingClientRect(),hit=document.elementFromPoint(b.left+b.width*.6,b.top+b.height/2);return el.closest('button').contains(hit);}),true,'Character body remains clickable');
    const navSize=await page.locator('header nav a').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
    assert.ok(navSize*scale>=14.4-0.01);
    for(const route of ['/posts','/places']) {
      await page.goto(base+route);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${route} ${width}/${scale} overflow`);
      const input=page.locator('main input').first();
      assert.ok((await input.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)))*scale>=14.4-0.01);
      await page.screenshot({path:`${folder}/${route.slice(1)}-${width}-zoom-${scale}.png`,fullPage:false});
    }
    await page.goto(base+'/posts');
    const article=page.locator('main ol article h2 a').first();
    await article.click();
    await page.waitForURL(url=>url.pathname.startsWith('/posts/'));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const bodyText=page.locator('main article p').first();
    assert.ok((await bodyText.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)))*scale>=14.4-0.01);
    await page.getByRole('button',{name:'打开小助手对话',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'小助手',exact:true});await dialog.waitFor();
    assert.equal(await dialog.locator('select[aria-label="助手形象"]').count(),0);
    assert.equal(await dialog.locator('[data-engine=frames]').count(),1);
    await page.waitForSelector('dialog canvas[data-ready=true]',{state:'attached'});
    const bubble=dialog.getByLabel('对话记录',{exact:true}).locator('p').first();
    assert.ok((await bubble.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)))*scale>=14.4-0.01);
    assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),'dialog internal overflow');
    const character=dialog.locator('[data-action]'),sheet=character.locator('canvas');
    await page.waitForSelector('dialog [data-action] canvas[data-ready=true]',{state:'attached'});
    assert.equal(await sheet.evaluate(el=>getComputedStyle(el).transform),'none');
    const before=await character.boundingBox();
    const positions=[];
    if(await sheet.isVisible()) {
    assert.equal(await character.getAttribute('data-action'),'idle');
    await dialog.getByRole('button',{name:'播放挥手动作'}).click();
    await page.waitForSelector('dialog canvas[data-ready=true]');
    for(const time of [0,300,600]) {
      positions.push(await sheet.evaluate(async(el,time)=>{const a=el.getAnimations()[0];a.pause();a.currentTime=time;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {left:el.dataset.pose,top:'0px'};},time));
      assert.deepEqual(await character.boundingBox(),before);
    }
    assert.ok(new Set(positions.map(p=>p.left)).size>=2,'wave must use distinct hand frames');
    await dialog.getByRole('button',{name:'让小助手点头'}).click();
    assert.equal(await character.getAttribute('data-action'),'nod');
    for(const [label,action] of [['挥手','wave'],['点头','nod'],['思考','thinking'],['鞠躬','bow'],['开心','cheer'],['打哈欠','yawn']]) {
      await dialog.getByRole('button',{name:`播放${label}动作`}).click();
      assert.equal(await character.getAttribute('data-action'),action);
      const frames=[];
      for(const time of drawingTimes(action)) {
        await page.waitForSelector(`dialog canvas[data-ready=true][data-loaded-action=${action}]`);
        frames.push(await sheet.evaluate(async(el,time)=>{const a=el.getAnimations()[0];a.pause();a.currentTime=time;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {left:el.dataset.pose,top:'0px'};},time+FRAME_BLEND_MS+1));
        assert.deepEqual(await character.boundingBox(),before);
      }
      assert.deepEqual(frames.map(frame=>frame.left),DRAWING_SEQUENCES[action].map(drawingKey),`${action}: selected drawing sequence`);
      assert.equal(new Set(frames.map(frame=>frame.top)).size,1);
      if(action!=='thinking') {
        await sheet.evaluate(el=>el.getAnimations()[0].finish());
        await page.waitForFunction(()=>document.querySelector('dialog [data-action] canvas')?.dataset.playing==='idle');
        assert.equal(await sheet.evaluate(el=>getComputedStyle(el).top),'0px');
      }
    }
    } else { assert.ok(cssHeight<=500,'Only compact-height dialogs may hide the companion'); }
    await dialog.getByRole('button',{name:'暂停动作'}).click();
    assert.equal(await sheet.evaluate(el=>el.getAnimations().length),0);
    assert.equal(await sheet.evaluate(el=>getComputedStyle(el).top),'0px');
    assert.equal(await sheet.evaluate(el=>getComputedStyle(el).left),'0px');
    await page.screenshot({path:`${folder}/actions-${width}-zoom-${scale}.png`});
    await dialog.getByRole('button',{name:'关闭小助手对话'}).click();
    await page.goto(base+'/assistant');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'/assistant overflow');
    results.push({physicalWidth:width,zoomEmulation:scale,largerCharacter:true,poseFrames:true,noWholeCharacterTransform:true,readability:true,noOverflow:true});
    await context.close();
  }
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.route('**/assistant/rig-*.png',r=>r.abort());
  await context.route('**/assistant/chibi-idle-blink-refined-v1.webp',r=>r.abort());
  const page=await context.newPage();await page.goto(base+'/assistant');
  await page.waitForFunction(()=>document.querySelector('[data-action] img')?.getAttribute('src')?.includes('chibi-neutral-left-collar-v4'));
  await context.close();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({accepted:true,mockedProvider:true,staticFallback:true,results},null,2));
} finally {await browser.close();}
