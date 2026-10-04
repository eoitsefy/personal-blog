// Uses disposable local services only. Exercises the real upload and post-reference API.
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3218";
const database = process.env.TEST_DATABASE_URL;
if (!database || !['localhost','127.0.0.1'].includes(new URL(base).hostname) || !['localhost','127.0.0.1'].includes(new URL(database).hostname) || !new URL(database).pathname.endsWith('_test')) throw new Error('Disposable local services required');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const db = new PrismaClient({datasourceUrl:database});
const browser = await chromium.launch({headless:true, channel:process.env.BROWSER_CHANNEL || 'msedge'});
const admin = await browser.newContext();
let userId, assetId, postId, categoryId, tagId;
const errors = [];
try {
  const user = await db.user.create({data:{email:`attached-${Date.now()}@example.test`,passwordHash:'!test-only',role:'ADMIN'}}); userId=user.id;
  const token=randomBytes(32).toString('base64url');
  await db.userSession.create({data:{userId,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+600000)}});
  await admin.addCookies([{name:'blog_session',value:token,url:base,httpOnly:true,sameSite:'Lax'}]);
  const image=await sharp({create:{width:1000,height:700,channels:3,background:'#3f788c'}}).png().toBuffer();
  const uploaded=await admin.request.post(`${base}/api/admin/assets`,{headers:{Origin:base},multipart:{file:{name:'attached.png',mimeType:'image/png',buffer:image}}});
  assert.equal(uploaded.status(),201);
  const asset=(await uploaded.json()).data.asset; assetId=asset.id;
  const suffix=Date.now(), title=`Attached image ${suffix}`, slug=`attached-image-${suffix}`, excerpt='Clickable summary';
  const response=await admin.request.post(`${base}/api/admin/posts`,{headers:{Origin:base},data:{title,slug,excerpt,contentMd:'Text without an image directive',status:'PUBLISHED',category:`Image ${suffix}`,tags:[`Tag ${suffix}`],assetIds:[assetId],placeIds:[]}});
  assert.equal(response.status(),201);
  const created=(await response.json()).data.post; postId=created.id;
  const saved=await db.post.findUniqueOrThrow({where:{id:postId},include:{category:true,tags:{include:{tag:true}}}});
  categoryId=saved.categoryId; tagId=saved.tags[0].tagId;
  const list=`${base}/posts?q=${encodeURIComponent(title)}`;
  await mkdir('.tool-tmp',{recursive:true});
  for (const width of [1280,390,320]) {
    const context=await browser.newContext({viewport:{width,height:844},isMobile:width<500,hasTouch:width<500});
    const page=await context.newPage(); page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${base}/posts/${slug}`);
    const gallery=page.getByRole('region',{name:'文章图片'});
    await gallery.waitFor({state:'visible'});
    assert.equal(await gallery.locator('img').count(),1);
    await gallery.getByRole('button',{name:'放大查看：attached.png'}).click();
    await page.getByRole('dialog').waitFor();
    await page.waitForFunction(()=>document.querySelector('dialog img')?.naturalWidth===1000);
    await page.getByRole('button',{name:'关闭图片预览'}).click();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    for (const target of ['blank','summary','thumbnail']) {
      await page.goto(list);
      const card=page.locator('main ol article').first();
      await card.waitFor({state:'visible'});
      await card.scrollIntoViewIfNeeded();
      assert.equal(await card.locator('img').count(),1);
      const element=target==='blank'?card:target==='summary'?card.getByText(excerpt,{exact:true}):card.locator('img');
      const box=await element.boundingBox();
      const x=box.x+(target==='blank'?15:box.width/2), y=box.y+(target==='blank'?box.height-10:box.height/2);
      if(width<500) await page.touchscreen.tap(x,y); else await page.mouse.click(x,y);
      await page.waitForURL(`${base}/posts/${slug}`);
    }
    await page.goto(list);
    await page.locator(`main ol article a[href="/posts?category=${encodeURIComponent(saved.category.slug)}"]`).click();
    await page.waitForURL(url=>url.searchParams.get('category')===saved.category.slug);
    await page.goto(list);
    await page.locator(`main ol article a[href="/posts?tag=${encodeURIComponent(saved.tags[0].tag.slug)}"]`).click();
    await page.waitForURL(url=>url.searchParams.get('tag')===saved.tags[0].tag.slug);
    await page.goto(list);
    const read=page.getByRole('link',{name:`阅读《${title}》`}); await read.focus(); await read.press('Enter');
    await page.waitForURL(`${base}/posts/${slug}`);
    await page.getByRole('region',{name:'文章图片'}).screenshot({path:`.tool-tmp/attached-images-${width}.png`});
    await context.close();
  }
  const editor=await admin.newPage();
  await editor.goto(`${base}/admin/posts/${postId}/edit`);
  await editor.getByRole('region',{name:'实时预览'}).getByRole('button',{name:'放大查看：attached.png'}).waitFor();
  await editor.goto(`${base}/admin/posts/${postId}/preview`);
  await editor.getByRole('region',{name:'文章图片'}).getByRole('button',{name:'放大查看：attached.png'}).waitFor();
  await db.post.update({where:{id:postId},data:{contentMd:`![inline](${asset.url})`}});
  await editor.goto(`${base}/posts/${slug}`);
  await editor.getByRole('button',{name:'放大查看：inline'}).waitFor();
  assert.equal(await editor.getByRole('region',{name:'文章图片'}).count(),0);
  assert.equal(await editor.getByRole('button',{name:'放大查看：inline'}).count(),1);
  await db.post.update({where:{id:postId},data:{contentMd:'Text only'}});
  for(const flags of [{deletedAt:new Date()},{deletedAt:null,isPublic:false}]) {
    await db.asset.update({where:{id:assetId},data:flags});
    await editor.goto(`${base}/posts/${slug}`);
    await editor.getByRole('heading',{name:title,exact:true}).waitFor();
    assert.equal(await editor.getByRole('region',{name:'文章图片'}).count(),0);
    await editor.goto(list);
    await editor.getByRole('link',{name:`阅读《${title}》`}).waitFor();
    assert.equal(await editor.locator('main ol article img').count(),0);
  }
  await db.asset.update({where:{id:assetId},data:{deletedAt:null,isPublic:true}});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({accepted:true,relatedImageWithoutMarkdown:true,thumbnail:true,wholeCard:true,taxonomyLinks:true,keyboard:true,mobileWidths:[320,390],noDuplicateInlineImage:true,privateDeletedImagesExcluded:true,editorAndAdminPreview:true}));
} finally {
  if(assetId) await db.asset.update({where:{id:assetId},data:{deletedAt:null,isPublic:true}});
  if(postId) {
    assert.equal((await admin.request.delete(`${base}/api/admin/posts/${postId}`,{headers:{Origin:base}})).status(),200);
    assert.equal((await admin.request.delete(`${base}/api/admin/posts/${postId}/purge`,{headers:{Origin:base}})).status(),200);
  }
  if(assetId) {
    assert.equal((await admin.request.delete(`${base}/api/admin/assets/${assetId}`,{headers:{Origin:base}})).status(),200);
    assert.equal((await admin.request.delete(`${base}/api/admin/assets/${assetId}/purge`,{headers:{Origin:base}})).status(),200);
  }
  if(userId) await db.user.deleteMany({where:{id:userId}});
  if(categoryId) await db.category.deleteMany({where:{id:categoryId,posts:{none:{}}}});
  if(tagId) await db.tag.deleteMany({where:{id:tagId,posts:{none:{}}}});
  await browser.close(); await db.$disconnect();
}
