// Browser-rendered pixel checks; production mode is read-only and sends no AI requests.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:3220';
if(!['localhost','127.0.0.1','eastherphil.cn'].includes(new URL(base).hostname)) throw Error('Unexpected target');
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'}), results=[],errors=[];
await mkdir('.tool-tmp/chibi-previews',{recursive:true});
const actions=[['挥手','wave',1800,1],['点头','nod',1500,2],['思考','thinking',2400,3],['鞠躬','bow',2000,4],['开心','cheer',1800,5]];
async function seek(canvas,time) {
  await canvas.evaluate((el,t)=>{const a=el.getAnimations()[0];a.pause();a.currentTime=t;},time);
  await canvas.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  return canvas.evaluate(el=>{
    const {data}=el.getContext('2d').getImageData(0,0,el.width,el.height);
    let top=el.height,bottom=-1,left=el.width,right=-1,sum=0,count=0;
    for(let y=0;y<el.height;y++)for(let x=0;x<el.width;x++)if(data[(y*el.width+x)*4+3]>100){
      top=Math.min(top,y);bottom=Math.max(bottom,y);left=Math.min(left,x);right=Math.max(right,x);
      if(y>=198){sum+=x;count++;}
    }
    return {top,bottom,left,right,footCentre:sum/count,pose:Number(el.dataset.pose),blend:Number(el.dataset.blend)};
  });
}
try {
 for(const width of [1280,768,390,320]) {
  const context=await browser.newContext({viewport:{width,height:844}});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForSelector('[data-action] canvas[data-ready=true]');
  const floating=page.locator('[data-action]').first();
  assert.equal(await floating.evaluate(el=>getComputedStyle(el).transform),'none');
  assert.equal(await floating.evaluate(el=>{const b=el.getBoundingClientRect();return el.closest('button').contains(document.elementFromPoint(b.left+5,b.top+b.height/2));}),false);
  await page.getByRole('button',{name:'打开小助手对话',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'小助手',exact:true});
  const character=dialog.locator('[data-action]'),canvas=character.locator('canvas');
  await page.waitForSelector('dialog canvas[data-ready=true]');
  const box=await character.boundingBox(), pixels=[];
  const idleTimes=[1,5270,5510,5690,5870,5990];
  for(const time of idleTimes) {
   const p=await seek(canvas,time);pixels.push(p);
   assert.ok(p.top>=8 && p.bottom<=216 && p.left>=8 && p.right<216,'Idle must contain complete figure with blank borders');
  }
  for(const [label,action,duration,row] of actions) {
   await dialog.getByRole('button',{name:`播放${label}动作`}).click();
   await page.waitForSelector('dialog canvas[data-ready=true]');
   const seen=[];
   for(const offset of [.075,.215,.355,.515,.695,.875]) {
    const p=await seek(canvas,duration*offset);seen.push(p.pose);pixels.push(p);
    assert.ok(p.top>=8 && p.bottom<=216 && p.left>=8 && p.right<216,`${action}: row bleed/cut boots`);
    assert.ok(Math.abs(p.footCentre-112)<=2,`${action}: feet drift (${p.footCentre})`);
    assert.deepEqual(await character.boundingBox(),box);
   }
   assert.deepEqual(seen,[0,1,2,3,4,5].map(c=>row*6+c));
   const a=await seek(canvas,duration*.14+30), b=await seek(canvas,duration*.14+55),c=await seek(canvas,duration*.14+80);
   assert.ok(a.blend>0 && a.blend<b.blend && b.blend<c.blend && c.blend<1,'Eased intermediate blends required');
   if(action!=='thinking') {
    await canvas.evaluate(el=>el.getAnimations()[0].finish());
    await page.waitForFunction(()=>document.querySelector('dialog canvas')?.getAnimations()[0]?.effect?.getTiming().duration===6000);
   }
  }
  await dialog.getByRole('button',{name:'暂停动作'}).click();
  assert.equal(await canvas.evaluate(el=>el.getAnimations().length),0);
  assert.equal(await canvas.getAttribute('data-pose'),'0');
  await canvas.screenshot({path:`.tool-tmp/chibi-previews/fixed-neutral-${width}.png`});
  assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth));
  await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);
  await page.goto(base+'/assistant');await page.waitForSelector('canvas[data-ready=true]');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  results.push({width,poses:pixels.length,fixedFeet:true,clearMargins:true,smoothTransitions:true});
  await context.close();
 }
 const reduced=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 const page=await reduced.newPage();await page.goto(base+'/assistant');await page.waitForSelector('canvas[data-ready=true]');
 assert.equal(await page.locator('canvas').evaluate(el=>el.getAnimations().length),0);
 await reduced.close();
 const fallback=await browser.newContext();await fallback.route('**/assistant/chibi-actions-v3.png',r=>r.abort());
 const f=await fallback.newPage();await f.goto(base+'/assistant');await f.waitForSelector('img[src*="chibi-idle-v3"]');await fallback.close();
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({accepted:true,noAIRequests:true,reducedMotion:true,fallback:true,results},null,2));
}finally{await browser.close();}
