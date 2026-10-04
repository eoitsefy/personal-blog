// Local browser UI verification with mocked responses. Never calls an AI provider.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:3220';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw Error('Local UI verification only');
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'}),results=[],errors=[];
await mkdir('.tool-tmp/chibi-previews',{recursive:true});
try {
  for(const width of [1280,768,390,320]) {
    const context=await browser.newContext({viewport:{width,height:844},hasTouch:width<500});
    let queries=0,reply='ok';
    await context.addInitScript(()=>{window.__microphoneRequests=0;navigator.mediaDevices.getUserMedia=()=>{window.__microphoneRequests++;throw Error('unexpected microphone request');};});
    await context.route('**/api/assistant/status',r=>r.fulfill({json:{ok:true,feature:{enabled:true},limits:{maxQuestionChars:500}}}));
    await context.route('**/api/assistant/query',async r=>{
      queries++; await new Promise(resolve=>setTimeout(resolve,150));
      if(reply==='rate')return r.fulfill({status:429,json:{success:false,error:{message:'提问过于频繁，请稍后再试'}}});
      if(reply==='html')return r.fulfill({status:502,contentType:'text/html',body:'upstream unavailable'});
      const result={answer:'这里有一段公开记录。',sources:[{postId:'p',title:'参考记录',url:reply==='unsafe'?'javascript:alert(1)':'/posts/example-post',excerpt:'原文片段'}],confidence:'high',mode:'grounded'};
      return r.fulfill({json:{success:true,data:result}});
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base); const trigger=page.getByRole('button',{name:'打开小助手对话'});await trigger.waitFor();
    assert.equal(queries,0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await trigger.click();const dialog=page.getByRole('dialog',{name:'小助手',exact:true});await dialog.waitFor();
    const input=dialog.getByLabel('你的问题',{exact:true}); await page.waitForFunction(()=>document.querySelector('dialog textarea')?.disabled===false);
    assert.equal(queries,0);assert.match(await dialog.getByLabel('对话记录',{exact:true}).textContent(),/技术|日志|地图/);
    const box=await dialog.boundingBox();assert.ok(box.width<=width && box.x>=0 && box.y>=0 && box.y+box.height<=844);
    for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.querySelector('dialog[open]').contains(document.activeElement)));}
    await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
    await trigger.click();await input.fill('你好');await dialog.getByRole('button',{name:'发送 ↗',exact:true}).click();await dialog.getByText('正在查找',{exact:false}).waitFor();await dialog.getByRole('article').getByText('这里有一段公开记录。',{exact:true}).waitFor();
    await dialog.locator('summary').click();assert.equal(await dialog.getByRole('link',{name:'参考记录 ↗'}).getAttribute('href'),'/posts/example-post');
    await dialog.getByRole('button',{name:'暂停动作'}).click();assert.equal(await dialog.getByRole('button',{name:'开启动作'}).getAttribute('aria-pressed'),'true');
    assert.equal(await dialog.locator('[data-action] img').evaluate(el=>getComputedStyle(el).animationName),'none');
    await dialog.getByRole('button',{name:'让小助手点头'}).click();
    await page.screenshot({path:`.tool-tmp/chibi-previews/dialog-${width}.png`});
    for(const [kind,text] of [['rate','提问过于频繁'],['html','助手暂时没有连接上'],['unsafe','助手返回的内容暂时无法显示']]) {
      reply=kind;await input.fill('继续查找');await dialog.getByRole('button',{name:'发送 ↗',exact:true}).click();await dialog.getByRole('alert').filter({hasText:text}).waitFor();assert.equal(await input.inputValue(),'继续查找');
    }
    await dialog.getByRole('button',{name:'清空对话'}).click();assert.equal(await dialog.getByText('这里有一段公开记录。',{exact:true}).count(),0);assert.equal(await input.inputValue(),'');
    reply='ok';await input.fill('保留这个问题');await dialog.getByRole('button',{name:'发送 ↗',exact:true}).click();await dialog.getByText('正在查找',{exact:false}).waitFor();await dialog.getByRole('button',{name:'关闭小助手对话'}).click();await trigger.click();await new Promise(resolve=>setTimeout(resolve,350));assert.equal(await dialog.getByRole('article').count(),0);assert.equal(await input.inputValue(),'保留这个问题');assert.equal(await dialog.getByRole('button',{name:'发送 ↗',exact:true}).isEnabled(),true);
    await dialog.getByRole('button',{name:'关闭小助手对话'}).click();
    await page.goto(base+'/assistant');assert.equal(await page.getByRole('button',{name:'打开小助手对话'}).count(),1);
    await page.getByRole('button',{name:'打开小助手对话'}).click();await page.getByRole('dialog',{name:'小助手',exact:true}).waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await page.evaluate(()=>window.__microphoneRequests),0);
    results.push({width,characterEntry:true,localGreeting:true,chatAndSources:true,focusAndEscape:true,motionPause:true,errorRecovery:true,noOverflow:true,noMicrophone:true});await context.close();
  }
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await context.route('**/api/assistant/status',r=>r.fulfill({json:{feature:{enabled:false}}}));
  const page=await context.newPage();await page.goto(base);await page.getByRole('button',{name:'打开小助手对话'}).click();
  const dialog=page.getByRole('dialog',{name:'小助手',exact:true});await dialog.getByText('助手暂不可用，你仍可以浏览日志和地点。',{exact:true}).waitFor();assert.equal(await dialog.getByLabel('你的问题',{exact:true}).isDisabled(),true);
  assert.equal(await dialog.locator('[data-action] img').evaluate(el=>getComputedStyle(el).animationName),'none');await context.close();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({accepted:true,mockedProvider:true,disabledFallback:true,reducedMotion:true,results},null,2));
}finally{await browser.close()}
