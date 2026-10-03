// Start a local UI_PREVIEW_MODE=true server without DATABASE_URL first.
// Playwright is a separately installed test tool, not a production dependency.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";

const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3219";
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname), "Local preview required");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const routes = [["首页", "/"], ["日志", "/posts"], ["地点", "/places"], ["助手", "/assistant"]];
try {
  for (const width of [320, 360, 375, 390, 430, 540, 760, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [active, path] of routes) {
      await page.goto(`${base}${path}`);
      const nav = page.getByRole("navigation", { name: "主导航" });
      await nav.waitFor({ state: "visible" });
      for (const [label, href] of routes) {
        const link = nav.getByRole("link", { name: label, exact: true });
        await link.waitFor({ state: "visible" });
        assert.equal(await link.isVisible(), true, `${width} ${path}: ${label} hidden`);
        assert.equal(await link.getAttribute("href"), href);
        const box = await link.boundingBox();
        assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1, `${width}: ${label} clipped`);
        if (width <= 760) assert.ok(box.height >= 44, "Touch target too small");
      }
      assert.equal(await nav.getByRole("link", { name: active, exact: true }).getAttribute("aria-current"), "page");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width} ${path}: horizontal page overflow`);
    }
    console.log(`navigation_width_${width}=passed`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  for (const [label, href] of routes.slice(1)) {
    await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: label, exact: true }).tap();
    await page.waitForURL(`${base}${href}`);
    await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: label, exact: true }).waitFor();
  }
  await page.goto(`${base}/posts/building-a-quiet-personal-archive`);
  assert.equal(await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "地点", exact: true }).isVisible(), true);

  await page.goto(base);
  await mkdir(".tool-tmp", { recursive: true });
  await page.locator("header").screenshot({ path: ".tool-tmp/mobile-navigation-390.png" });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.locator("header").screenshot({ path: ".tool-tmp/mobile-navigation-320.png" });

  // Simulate enlarged navigation text and a real horizontal touch gesture.
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.evaluate((element) => { element.style.fontSize = "36px"; element.scrollLeft = 0; });
  assert.equal(await nav.evaluate((element) => element.scrollWidth > element.clientWidth), true);
  const bounds = await nav.boundingBox();
  const cdp = await context.newCDPSession(page);
  const startX = bounds.x + bounds.width - 20;
  const y = bounds.y + bounds.height / 2;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y }] });
  for (let step = 1; step <= 6; step++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: startX - step * 25, y }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForFunction(() => document.querySelector('nav[aria-label="主导航"]').scrollLeft > 0);
  await nav.evaluate((element) => { element.scrollLeft = 0; });
  const last = nav.getByRole("link", { name: "助手", exact: true });
  await last.focus();
  await page.waitForFunction(() => {
    const navigation = document.querySelector('nav[aria-label="主导航"]');
    const link = navigation.querySelector('a[href="/assistant"]');
    const outer = navigation.getBoundingClientRect();
    const inner = link.getBoundingClientRect();
    return inner.x >= outer.x - 1 && inner.right <= outer.right + 1;
  });
  const focused = await last.boundingBox();
  assert.ok(focused.x >= bounds.x - 1 && focused.x + focused.width <= bounds.x + bounds.width + 1);
  assert.equal(await last.evaluate((element) => document.activeElement === element), true);
  assert.deepEqual(errors, []);
  console.log("mobile_navigation_touch_keyboard_and_large_text=passed");
} catch (error) {
  await mkdir(".tool-tmp", { recursive: true });
  await page.screenshot({ path: ".tool-tmp/mobile-navigation-failure.png" });
  throw error;
} finally { await browser.close(); }
