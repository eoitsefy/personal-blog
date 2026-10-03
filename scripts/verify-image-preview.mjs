// Disposable local application/database only. Never creates production content.
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";

const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3218";
const database = process.env.TEST_DATABASE_URL;
const local = host => ["127.0.0.1", "localhost", "[::1]"].includes(host);
if (!database || !local(new URL(base).hostname) || !local(new URL(database).hostname) || !new URL(database).pathname.endsWith("_test")) {
  throw new Error("Disposable local test services required");
}
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const db = new PrismaClient({ datasourceUrl: database });
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const admin = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const errors = [];
const page = await admin.newPage();
page.on("pageerror", error => errors.push(error.message));
page.on("dialog", dialog => dialog.accept());
let userId, postId, assetId;
try {
  const user = await db.user.create({ data: { email: `preview-${Date.now()}@example.test`, passwordHash: "!test-session-only", role: "ADMIN" } });
  userId = user.id;
  const token = randomBytes(32).toString("base64url");
  await db.userSession.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 600_000) } });
  await admin.addCookies([{ name: "blog_session", value: token, url: base, httpOnly: true, sameSite: "Lax" }]);
  await page.goto(`${base}/admin/media`);
  const filename = `preview-${Date.now()}.png`;
  const image = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: "#346d87" } }).png().toBuffer();
  await page.locator('input[name="file"]').setInputFiles({ name: filename, mimeType: "image/png", buffer: image });
  const upload = page.waitForResponse(response => response.url().endsWith("/api/admin/assets") && response.request().method() === "POST");
  await page.getByRole("button", { name: "上传", exact: true }).click();
  assert.equal((await upload).status(), 201);
  const asset = await db.asset.findFirstOrThrow({ where: { ownerId: userId, originalName: filename } });
  assetId = asset.id;

  async function checkViewer(target, trigger, { mobile = false, screenshot, afterOpen } = {}) {
    await trigger.scrollIntoViewIfNeeded();
    const scroll = await target.evaluate(() => scrollY);
    await trigger.focus();
    if (mobile) await trigger.tap(); else await trigger.press("Enter");
    const dialog = target.getByRole("dialog");
    await dialog.waitFor({ state: "visible" });
    const enlarge = dialog.getByRole("button", { name: "放大图片", exact: true });
    await target.waitForFunction(() => !document.querySelector('dialog [aria-label="放大图片"]').disabled);
    if (afterOpen) await afterOpen();
    assert.ok(await dialog.isVisible());
    const original = dialog.getByRole("link", { name: "查看原图 ↗" });
    assert.equal(await original.getAttribute("href"), asset.url);
    assert.equal(await target.evaluate(() => document.body.style.position), "fixed");
    const before = await dialog.getByRole("img").boundingBox();
    await enlarge.click();
    await enlarge.click();
    const after = await dialog.getByRole("img").boundingBox();
    assert.ok(after.width >= before.width * 1.9);
    const area = dialog.locator('[aria-label^="图片查看区域"]');
    assert.ok(await area.evaluate(element => element.scrollWidth > element.clientWidth));
    await area.evaluate(element => { element.scrollLeft = 120; });
    assert.ok(await area.evaluate(element => element.scrollLeft > 0));
    await dialog.getByRole("button", { name: "适应屏幕", exact: true }).click();
    if (screenshot) await target.screenshot({ path: screenshot });
    // Native dialog keeps keyboard navigation inside the modal.
    for (let index = 0; index < 9; index++) {
      await target.keyboard.press("Tab");
      assert.ok(await target.evaluate(() => document.querySelector("dialog").contains(document.activeElement)));
    }
    if (mobile) await dialog.getByRole("button", { name: "关闭图片预览" }).tap(); else await target.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.ok(await trigger.evaluate(element => element === document.activeElement));
    assert.equal(await target.evaluate(() => document.body.style.position), "");
    assert.ok(Math.abs(await target.evaluate(() => scrollY) - scroll) < 3);
  }

  await checkViewer(page, page.getByRole("button", { name: `放大查看：${filename}` }));
  const post = await db.post.create({ data: {
    title: "Image preview acceptance", slug: `image-preview-${Date.now()}`, authorId: userId,
    contentMd: `![正文图片](${asset.url})\n\n[![已有图片链接](${asset.url})](/posts)\n\n![失效图片](/uploads/missing-preview-test.png)`,
    status: "PUBLISHED", publishedAt: new Date(),
  } });
  postId = post.id;
  await page.goto(`${base}/admin/posts/${postId}/edit`);
  await page.getByRole("status").filter({ hasText: "自动保存已就绪" }).waitFor();
  await page.getByLabel("正文（Markdown）").fill(post.contentMd + "\n\nAutosave while viewing");
  await checkViewer(page, page.getByRole("region", { name: "实时预览" }).getByRole("button", { name: "放大查看：正文图片" }), {
    afterOpen: () => page.waitForFunction(() => document.body.textContent.includes("工作副本已自动保存")),
  });
  await checkViewer(page, page.getByRole("button", { name: `放大查看：${filename}` }));
  assert.ok(page.url().endsWith(`/admin/posts/${postId}/edit`), "preview must not submit the editor");
  assert.equal((await db.post.findUniqueOrThrow({ where: { id: postId } })).contentMd, post.contentMd);
  await page.goto(`${base}/admin/posts/${postId}/preview`);
  await checkViewer(page, page.getByRole("button", { name: "放大查看：正文图片" }));
  await mkdir(".tool-tmp", { recursive: true });
  for (const width of [1280, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 500, hasTouch: width < 500 });
    const publicPage = await context.newPage();
    publicPage.on("pageerror", error => errors.push(error.message));
    await publicPage.goto(`${base}/posts/${post.slug}`);
    const trigger = publicPage.getByRole("button", { name: "放大查看：正文图片" });
    await checkViewer(publicPage, trigger, { mobile: width < 500, screenshot: `.tool-tmp/image-preview-${width}.png` });
    assert.equal(await publicPage.locator('a[href="/posts"]').filter({ has: publicPage.getByAltText("已有图片链接") }).locator("button").count(), 0);
    await publicPage.getByRole("button", { name: "放大查看：失效图片" }).click();
    await publicPage.getByRole("dialog").getByRole("alert").waitFor();
    await publicPage.getByRole("button", { name: "关闭图片预览" }).click();
    await trigger.click();
    await publicPage.setViewportSize({ width: 844, height: 390 });
    await publicPage.waitForTimeout(100);
    const box = await publicPage.getByRole("dialog").boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 845 && box.y + box.height <= 391);
    await publicPage.getByRole("button", { name: "关闭图片预览" }).click();
    if (width === 1280) {
      await trigger.click();
      await publicPage.mouse.click(2, 2);
      await publicPage.getByRole("dialog").waitFor({ state: "detached" });
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ accepted: true, upload: true, media: true, editor: true, draftPreview: true, publicDesktopMobile: true, zoomScroll: true, focus: true, failedImage: true, rotation: true }));
} finally {
  if (postId) await db.post.deleteMany({ where: { id: postId } });
  if (assetId) {
    assert.equal((await admin.request.delete(`${base}/api/admin/assets/${assetId}`, { headers: { Origin: base } })).status(), 200);
    assert.equal((await admin.request.delete(`${base}/api/admin/assets/${assetId}/purge`, { headers: { Origin: base } })).status(), 200);
  }
  if (userId) await db.user.deleteMany({ where: { id: userId } });
  await browser.close();
  await db.$disconnect();
}
