// Optional browser acceptance. Requires Playwright installed separately (or PLAYWRIGHT_MODULE).
// Never point this harness at production: both services must be loopback test instances.
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3218";
const database = process.env.TEST_DATABASE_URL;
const local = (host) => ["127.0.0.1", "localhost", "[::1]"].includes(host);
if (!database || !local(new URL(base).hostname) || !local(new URL(database).hostname)
  || !new URL(database).pathname.endsWith("_test")) throw new Error("Disposable local test services required");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const db = new PrismaClient({ datasourceUrl: database });
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const context = await browser.newContext({ viewport: { width: 1365, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("dialog", (dialog) => dialog.accept());
let userId, postId;
try {
  const user = await db.user.create({ data: { email: `browser-${Date.now()}@example.test`, passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12), role: "ADMIN" } });
  userId = user.id;
  const token = randomBytes(32).toString("base64url");
  await db.userSession.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 600_000) } });
  await context.addCookies([{ name: "blog_session", value: token, url: base, httpOnly: true, sameSite: "Lax" }]);
  const post = await db.post.create({ data: { title: "Initial browser article", slug: `browser-${Date.now()}`, contentMd: "Initial public body", status: "PUBLISHED", publishedAt: new Date(), authorId: userId } });
  postId = post.id;
  const editUrl = `${base}/admin/posts/${postId}/edit`;
  await page.goto(editUrl);
  await page.getByRole("status").filter({ hasText: "自动保存已就绪" }).waitFor();
  await page.getByLabel("标题", { exact: true }).fill("写作增强验收");
  await page.getByLabel("正文（Markdown）").fill("# 即时预览\n\n**内容不会自动发布。**\n\n- 写作\n- 日常记录\n\n"
    + "longword".repeat(30) + "\n\n| First column | Second column | Third column |\n| --- | --- | --- |\n| Text | Text | Text |\n");
  await page.getByRole("region", { name: "实时预览" }).getByRole("heading", { name: "即时预览" }).waitFor();
  await page.getByRole("status").filter({ hasText: "工作副本已自动保存" }).waitFor();
  assert.equal((await db.post.findUniqueOrThrow({ where: { id: postId } })).contentMd, "Initial public body");
  await page.reload();
  await page.getByRole("button", { name: /恢复此窗口暂存|恢复服务器工作副本/ }).first().click();
  assert.match(await page.getByLabel("正文（Markdown）").inputValue(), /即时预览/);

  const upload = page.waitForResponse((r) => r.url().endsWith("/api/admin/assets") && r.request().method() === "POST");
  await page.getByLabel("正文（Markdown）").evaluate((element) => {
    const raw = atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlZsAAAAASUVORK5CYII=");
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(raw, (c) => c.charCodeAt(0))], "pasted.png", { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, clipboardData: transfer }));
  });
  assert.equal((await upload).status(), 201);
  await page.getByRole("region", { name: "实时预览" }).getByRole("img", { name: "pasted.png" }).waitFor();
  await page.getByRole("status").filter({ hasText: "工作副本已自动保存" }).waitFor();
  await mkdir(".tool-tmp", { recursive: true });
  await page.screenshot({ path: ".tool-tmp/editor-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: ".tool-tmp/editor-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await page.waitForURL(`${base}/admin/posts`);
  const updated = await db.post.findUniqueOrThrow({ where: { id: postId } });
  assert.equal(updated.title, "写作增强验收");
  assert.match(updated.contentMd, /\/uploads\//);
  assert.equal(updated.status, "PUBLISHED");

  await page.goto(editUrl);
  await page.getByRole("status").filter({ hasText: "自动保存已就绪" }).waitFor();
  await page.getByRole("button", { name: "查看历史版本" }).click();
  await page.getByRole("button", { name: "载入此版本" }).last().click();
  await page.getByText("历史内容已载入；请检查媒体和地点后保存。保存为草稿会撤下当前公开文章。", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("正文（Markdown）").inputValue(), "Initial public body");
  assert.equal(await page.getByRole("combobox", { name: /状态/ }).inputValue(), "DRAFT");
  assert.equal((await db.post.findUniqueOrThrow({ where: { id: postId } })).status, "PUBLISHED");

  // An actual offline edit survives refresh via tab-scoped storage and retries when online.
  await context.setOffline(true);
  await page.getByLabel("正文（Markdown）").fill("Offline recovered text");
  await page.getByRole("status").filter({ hasText: /Failed to fetch|失败|网络/ }).waitFor();
  await context.setOffline(false);
  await page.reload();
  await page.getByRole("button", { name: "恢复此窗口暂存" }).click();
  assert.equal(await page.getByLabel("正文（Markdown）").inputValue(), "Offline recovered text");
  await page.getByRole("status").filter({ hasText: "工作副本已自动保存" }).waitFor();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ accepted: true, autosave: "passed", publicIsolation: "passed", windowRecovery: "passed", pasteImage: "passed", preview: "passed", savedHistory: "passed", offlineRecovery: "passed", desktop: "passed", mobile: "passed" }));
} finally {
  await browser.close();
  if (postId) await db.post.deleteMany({ where: { id: postId } });
  if (userId) {
    await db.asset.deleteMany({ where: { ownerId: userId } });
    await db.user.deleteMany({ where: { id: userId } });
  }
  await db.$disconnect();
}
