// Read-only browser animation acceptance; no provider requests, microphone or writes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3220';
if(!['localhost','127.0.0.1','eastherphil.cn'].includes(new URL(base).hostname))throw Error('Unexpected target');
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'}),results=[],errors=[];
await mkdir('.tool-tmp/rig-previews',{recursive:true});
async function seek(canvas,time){
 await canvas.evaluate((el,t)=>{const a=el.getAnimations()[0];a.pause();a.currentTime=t;},time);
 await canvas.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 return canvas.evaluate(el=>{
  const data=el.getContext('2d').getImageData(0,0,224,224).data;let top=224,bottom=-1,left=224,right=-1,footLeft=224,footRight=-1,footSum=0,footCount=0;
  for(let y=0;y<224;y++)for(let x=0;x<224;x++)if(data[(y*224+x)*4+3]>100){top=Math.min(top,y);bottom=Math.max(bottom,y);left=Math.min(left,x);right=Math.max(right,x);}
  for(let y=199;y<224;y++)for(let x=0;x<224;x++)if(data[(y*224+x)*4+3]>100){footLeft=Math.min(footLeft,x);footRight=Math.max(footRight,x);footSum+=x;footCount++;}
  return {top,bottom,left,right,footLeft,footRight,footCentre:footSum/footCount,x:Number(el.dataset.leftX),y:Number(el.dataset.leftY),mouth:Number(el.dataset.mouth),blink:Number(el.dataset.blink)};
 });
}
try {
 for(const width of [1280,768,390,320]){
  const context=await browser.newContext({viewport:{width,height:844}});let queries=0;const atlas=new Set();
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{const p=new URL(r.url()).pathname;if(p==='/api/assistant/query')queries++;if(/rig-.*\.png$/.test(p))atlas.add(p);});
  await page.goto(base);await page.waitForSelector('[data-engine=rig] canvas[data-ready=true]');
  assert.deepEqual([...atlas],['/assistant/rig-gold-v2.png']);
  await page.getByRole('button',{name:'打开小助手对话',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'小助手',exact:true});
  const samples={};
  for(const skin of ['gold','mist']){
   await dialog.getByRole('combobox',{name:'助手形象'}).selectOption(skin);
   await page.waitForSelector(`dialog [data-skin=${skin}] canvas[data-ready=true]`);
   const canvas=dialog.locator('canvas'),character=dialog.locator('[data-action]'),box=await character.boundingBox();
   const neutral=await seek(canvas,0);
   for(const [name,duration]of [['挥手',1800],['打哈欠',2600],['点头',1500],['思考',2400],['鞠躬',2000],['开心',1800]]){
    await dialog.getByRole('button',{name:`播放${name}动作`}).click();await page.waitForSelector('dialog canvas[data-ready=true]');
    const poses=[];
    for(const fraction of [.01,.1,.2,.3,.4,.5,.6,.7,.8,.9,.99]){
     const p=await seek(canvas,duration*fraction);poses.push([p.x,p.y,p.mouth,p.blink]);
     assert.ok(p.top>=3&&p.bottom<=216&&p.left>=5&&p.right<219,`${skin}/${name} cropped`);
     assert.ok(Math.abs(p.footLeft-neutral.footLeft)<=1&&Math.abs(p.footRight-neutral.footRight)<=1&&Math.abs(p.footCentre-neutral.footCentre)<.5,`${skin}/${name} feet drift: ${JSON.stringify(p)}`);assert.deepEqual(await character.boundingBox(),box);
    }
    if(name==='挥手'||name==='打哈欠'){
     const p1=await seek(canvas,duration*.2),p2=await seek(canvas,duration*.2+8),p3=await seek(canvas,duration*.2+16);
     assert.notEqual(p1.x,p2.x);assert.notEqual(p2.x,p3.x);assert.ok(Math.abs(p2.x-p1.x)<2,'Joint jump');
    }
    samples[`${skin}/${name}`]=poses;
    if(width===1280){await seek(canvas,duration*.5);await canvas.screenshot({path:`.tool-tmp/rig-previews/${skin}-${name}.png`});}
    if(name!=='思考'){await canvas.evaluate(el=>el.getAnimations()[0].finish());await page.waitForFunction(()=>document.querySelector('dialog canvas')?.getAnimations()[0]?.effect?.getTiming().duration===6000);}
   }
   await dialog.getByRole('button',{name:'暂停动作'}).click();assert.equal(await canvas.evaluate(el=>el.getAnimations().length),0);
   if(width===1280)await canvas.screenshot({path:`.tool-tmp/rig-previews/${skin}-neutral.png`});
   await dialog.getByRole('button',{name:'开启动作'}).click();
  }
  for(const name of ['挥手','打哈欠','点头','思考','鞠躬','开心'])assert.deepEqual(samples[`gold/${name}`],samples[`mist/${name}`],'Skins must share exact motion curves');
  assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);assert.equal(queries,0);
  results.push({width,twoSkins:true,sharedCurves:true,continuousJoints:true,fixedFeet:true,noOverflow:true,noAiQueries:true});await context.close();
 }
 const reduced=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await reduced.newPage();await page.goto(base);await page.waitForSelector('[data-engine=rig] canvas[data-ready=true]');assert.equal(await page.locator('[data-engine=rig] canvas').evaluate(el=>el.getAnimations().length),0);await reduced.close();
 const fallback=await browser.newContext();await fallback.route('**/assistant/rig-*.png',r=>r.abort());const p=await fallback.newPage();await p.goto(base);await p.waitForSelector('[data-action] canvas[data-ready=true]');assert.equal(await p.locator('[data-engine=rig]').count(),0);await fallback.close();
 assert.deepEqual(errors,[]);console.log(JSON.stringify({accepted:true,reducedMotion:true,legacyFallback:true,results},null,2));
}finally{await browser.close();}
