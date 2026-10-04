// Disposable local database only. No production users, posts or uploads are touched.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:3218', database=process.env.TEST_DATABASE_URL;
if (!database || !['localhost','127.0.0.1'].includes(new URL(base).hostname) || !['localhost','127.0.0.1'].includes(new URL(database).hostname) || !new URL(database).pathname.endsWith('_test')) throw new Error('Disposable local services required');
const require=createRequire(import.meta.url), {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const db=new PrismaClient({datasourceUrl:database}), browser=await chromium.launch({headless:true,channel:'msedge'});
const admin=await browser.newContext(); let userId,postId; const assets=[], errors=[], results=[];
try {
  const user=await db.user.create({data:{email:`video-ui-${Date.now()}@example.test`,passwordHash:'!test-only',role:'ADMIN'}}); userId=user.id;
  const token=randomBytes(32).toString('base64url');
  await db.userSession.create({data:{userId,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+600000)}});
  await admin.addCookies([{name:'blog_session',value:token,url:base,httpOnly:true,sameSite:'Lax'}]);
  const page=await admin.newPage(); page.on('pageerror',e=>errors.push(e.name));
  await page.goto(`${base}/admin/posts/new`);
  const category=page.locator('select').filter({has:page.locator('option[value="技术随记"]')});
  await category.waitFor(); assert.equal(await category.evaluate(el=>el.tagName),'SELECT');
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='创建文章' && !b.disabled));
  assert.deepEqual(await category.locator('option').allTextContents(),['未分类','技术随记','生活切片','阅读与灵感','其他']);
  const suffix=Date.now(),slug=`video-ui-${suffix}`;
  await page.getByLabel('标题',{exact:true}).fill(`Video UI ${suffix}`);
  await category.click(); // Actual focus transfer triggers the editor's automatic slug.
  await category.selectOption({label:'技术随记'});
  await page.waitForFunction(expected=>Array.from(document.querySelectorAll('input')).some(input=>input.value===expected),slug);
  await page.getByLabel('标签',{exact:true}).fill('视频记录, 测试');
  await page.locator('select').filter({has:page.locator('option[value="DRAFT"]')}).selectOption('PUBLISHED');
  const upload=page.waitForResponse(r=>r.url().endsWith('/api/admin/assets') && r.request().method()==='POST');
  await page.getByLabel('上传正文视频',{exact:true}).setInputFiles('src/integration/fixtures/video.mp4');
  const uploaded=await upload; assert.equal(uploaded.status(),201); const mp4=(await uploaded.json()).data.asset; assets.push(mp4);
  await page.waitForFunction(()=>document.querySelector('textarea[rows="20"]')?.value.includes('[video:'));
  const create=page.waitForResponse(r=>r.url().endsWith('/api/admin/posts') && r.request().method()==='POST');
  await page.getByRole('button',{name:'创建文章',exact:true}).click();
  const created=await create; assert.equal(created.status(),201); const post=(await created.json()).data.post; postId=post.id;
  assert.equal(post.category.slug,'development'); assert.equal(post.tags.length,2);
  assert.equal(post.slug,slug); assert.equal(post.status,'PUBLISHED');
  for (const [ext,mime] of [['mov','video/quicktime'],['webm','video/webm']]) {
    const res=await admin.request.post(`${base}/api/admin/assets`,{headers:{Origin:base},multipart:{file:{name:`clip.${ext}`,mimeType:mime,buffer:await readFile(`src/integration/fixtures/video.${ext}`)}}});
    assert.equal(res.status(),201); assets.push((await res.json()).data.asset);
  }
  const patch=await admin.request.patch(`${base}/api/admin/posts/${postId}`,{headers:{Origin:base},data:{assetIds:assets.map(a=>a.id)}}); assert.equal(patch.status(),200);
  const filters=await admin.request.get(`${base}/api/posts?category=development`); assert.ok((await filters.json()).data.posts.some(p=>p.id===postId));
  for (const width of [1280,390,320]) {
    const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<500}); const p=await context.newPage(); p.on('pageerror',e=>errors.push(e.name));
    const navigation=await p.goto(`${base}/posts/${slug}`); assert.equal(navigation.status(),200);
    await p.locator('video').first().waitFor(); assert.equal(await p.locator('video').count(),3);
    const playback=await p.locator('video').first().evaluate(async video=>{
      video.muted=true;video.load(); await video.play(); video.currentTime=.5;
      await new Promise((resolve,reject)=>{video.addEventListener('seeked',resolve,{once:true});setTimeout(()=>reject(new Error('seek timeout')),5000)});
      video.pause();return {width:video.videoWidth,height:video.videoHeight,time:video.currentTime};
    });
    assert.equal(playback.width,64); assert.ok(playback.time>=.4);
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    results.push({width,playback:true,seek:true,noOverflow:true}); await context.close();
  }
  const range=await admin.request.get(`${base}${mp4.url}`,{headers:{Range:'bytes=0-15'}});assert.equal(range.status(),206);
  await page.goto(`${base}/admin/media?kind=VIDEO`); await page.getByText('上传图片、音频、视频或文档',{exact:true}).waitFor();
  await page.route('**/api/admin/assets',route=>route.fulfill({status:413,contentType:'text/html',body:'<html>too large</html>'}));
  await page.locator('input[name="file"]').setInputFiles('src/integration/fixtures/video.mp4');
  await page.getByRole('button',{name:'上传',exact:true}).click();
  await page.getByText(/文件超过上传大小限制/).waitFor();
  assert.equal(errors.length,0);
  console.log(JSON.stringify({accepted:true,editorUpload:true,categorySelect:true,separateTags:true,homepageFiltering:true,range:true,html413Message:true,results},null,2));
} finally {
  if(postId){await admin.request.delete(`${base}/api/admin/posts/${postId}`,{headers:{Origin:base}});await admin.request.delete(`${base}/api/admin/posts/${postId}/purge`,{headers:{Origin:base}});}
  for(const a of assets){await admin.request.delete(`${base}/api/admin/assets/${a.id}`,{headers:{Origin:base}});await admin.request.delete(`${base}/api/admin/assets/${a.id}/purge`,{headers:{Origin:base}});}
  if(userId)await db.user.delete({where:{id:userId}});
  await db.category.deleteMany({where:{posts:{none:{}}}});await db.tag.deleteMany({where:{posts:{none:{}}}});
  await browser.close();await db.$disconnect();
}
