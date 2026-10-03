// Use a local production build with disposable public place fixtures and a dummy
// AMAP_JS_API_KEY. The SDK is mocked locally; LIVE_MAP_SMOKE=1 is read-only QA
// against the real public map and never injects fixtures or provider credentials.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";

const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3220";
const live = process.env.LIVE_MAP_SMOKE === "1";
assert.ok(live || ["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Mock mode requires localhost");
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const sdkMock = `(() => {
  const state = window.__mapTest = { options: null, fits: [], focus: [], resizes: 0 };
  class Map {
    constructor(container, options) {
      this.container = container; this.events = {}; state.options = options;
      this.observer = new ResizeObserver(() => { state.resizes++; this.events.resize?.(); });
      if (options.resizeEnable) this.observer.observe(container);
      setTimeout(() => this.events.complete?.(), 50);
    }
    on(event, fn) { this.events[event] = fn; }
    off(event) { delete this.events[event]; }
    addControl() {}
    setZoomAndCenter(...args) { state.focus.push(args); }
    setFitView(overlays, immediate, padding, zoom) { state.fits.push({padding, zoom}); }
    destroy() { this.observer.disconnect(); this.container.replaceChildren(); }
  }
  class Marker {
    constructor(options) {
      this.position = options.position; this.element = document.createElement('div');
      this.element.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-22px,-22px)';
      if(options.content) this.setContent(options.content);
      this.setMap(options.map);
    }
    getPosition() { return {getLng:()=>this.position[0], getLat:()=>this.position[1]}; }
    setContent(content) { this.element.replaceChildren(content); }
    setOffset() {}
    setPosition(position) { this.position = position; }
    setMap(map) { if(map) map.container.append(this.element); else this.element.remove(); }
  }
  window.AMapLoader = {load: async () => ({Map, Marker, Pixel: class {}, Scale: class {}, ToolBar: class {}, MarkerCluster: class {setMap(){} setData(){}}})};
})();`;
const cases = [
  ["phone-320", "iPhone 13", 320, 568],
  ["phone-360", "Pixel 7", 360, 640],
  ["phone-375", "iPhone 13", 375, 667],
  ["iphone-390", "iPhone 13", 390, 664],
  ["pixel-412", "Pixel 7", 412, 839],
  ["phone-430", "iPhone 13", 430, 932],
  ["tablet-768", "iPad Mini", 768, 1024],
  ["desktop", null, 1440, 900],
];
await mkdir(".tool-tmp", { recursive: true });
try {
  for (const [name, device, width, height] of cases) {
    const context = await browser.newContext({ ...(device ? devices[device] : {}), viewport: {width, height} });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message.replace(/https?:\/\/\S+/g, "[url]")));
    if (!live) await page.route("https://webapi.amap.com/loader.js", route => route.fulfill({contentType:"text/javascript",body:sdkMock}));
    await page.goto(`${base}/places`, {waitUntil:"domcontentloaded"});
    const map = page.getByRole("region", {name:/^高德地图，显示/});
    await map.waitFor({state:"visible",timeout:45000});
    await page.getByRole("button", {name:/^当前地点：/}).waitFor();
    await page.waitForTimeout(live ? 1200 : 100);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: page overflow`);
    const bounds = await map.boundingBox();
    assert.ok(bounds.width >= width - (width <= 640 ? 30 : 200), `${name}: map width`);
    assert.ok(bounds.height >= 280, `${name}: map height`);
    if (width <= 640) assert.ok(bounds.y < height - 100, `${name}: map must be visible in initial viewport`);
    const controls = await page.locator('[aria-label="地点地图"] select, [aria-label="地点地图"] button[aria-pressed], [aria-label="地点地图"] a[href^="#place-"]').all();
    for (const control of controls) {
      const rect = await control.boundingBox();
      assert.ok(rect && rect.height >= 44 && rect.x >= 0 && rect.x + rect.width <= width + 1, `${name}: touch control bounds`);
    }
    if (width <= 640) {
      assert.ok(await page.locator('input[name="q"]').evaluate(e => parseFloat(getComputedStyle(e).fontSize) >= 16), "Avoid iOS form zoom");
      assert.ok(await page.getByRole('combobox', {name:'地点',exact:true}).evaluate(e => parseFloat(getComputedStyle(e).fontSize) >= 16));
    }
    const select = page.getByRole("combobox", {name:"地点",exact:true});
    const options = await select.locator("option").count();
    if (options > 1) {
      for (const index of new Set([1, options - 1])) {
        await select.selectOption({index});
        const label = await page.getByRole("button", {name:/^当前地点：/}).locator("strong").boundingBox();
        assert.ok(label.x >= bounds.x && label.x + label.width <= bounds.x + bounds.width + 1, `${name}: long marker label`);
      }
      await page.getByRole("button", {name:"全部地点",exact:true}).click();
      if (!live) assert.equal(await page.evaluate(() => window.__mapTest.fits.at(-1).zoom), 11, "Preserve approximate-place zoom");
    }
    await select.selectOption({index:0});
    await page.evaluate(() => scrollTo(0,0));
    await page.screenshot({path:`.tool-tmp/mobile-map-${live ? "live" : "local"}-${name}.png`,fullPage:name === "iphone-390"});
    if (device && width <= 640) {
      if (options > 1) await page.getByRole("button", {name:"全部地点",exact:true}).click();
      await page.setViewportSize({width:height,height:width});
      await page.waitForTimeout(700);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: landscape overflow`);
      const rotated = await map.boundingBox();
      assert.ok(rotated.width > bounds.width, `${name}: map resizes with orientation`);
      if (!live) {
        const state = await page.evaluate(() => window.__mapTest);
        assert.equal(state.options.resizeEnable, true);
        assert.ok(state.resizes > 1);
        if (options > 1) assert.ok(state.fits.length > 1, "Overview refits after rotation");
      } else {
        const canvasWidth = await map.locator("canvas").first().evaluate(e => e.getBoundingClientRect().width);
        assert.ok(Math.abs(canvasWidth - rotated.width) <= 2, `${name}: SDK canvas resized`);
      }
      await page.getByRole("button", {name:"查看周边",exact:true}).click();
      await page.setViewportSize({width,height});
      await page.waitForTimeout(500);
      const marker = await page.getByRole("button", {name:/^当前地点：/}).boundingBox();
      const restored = await map.boundingBox();
      assert.ok(marker.x >= restored.x && marker.x + marker.width <= restored.x + restored.width, `${name}: selected point after rotation`);
    }
    assert.deepEqual(errors, [], `${name}: browser errors`);
    console.log(`mobile_map_${live ? "live" : "local"}_${name}=passed`);
    await context.close();
  }
  // Provider failures must retain a usable mobile coordinate overview and directory.
  const context = await browser.newContext({...devices["iPhone 13"],viewport:{width:320,height:568}});
  const page = await context.newPage();
  await page.route("https://webapi.amap.com/loader.js", route => route.abort());
  await page.goto(`${base}/places`);
  await page.getByRole("status").filter({hasText:"已启用本地概览"}).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const fallback = page.locator('[aria-label="无需第三方脚本的公开坐标概览"]');
  const box = await fallback.boundingBox();
  for (const marker of await fallback.locator("a").all()) {
    const rect = await marker.boundingBox();
    assert.ok(rect.x >= box.x - 1 && rect.x + rect.width <= box.x + box.width + 1, "Fallback marker clipping");
    assert.ok(rect.y >= box.y && rect.y + rect.height <= box.y + box.height + 4, "Fallback label must not overflow vertically");
  }
  await page.screenshot({path:`.tool-tmp/mobile-map-${live ? "live" : "local"}-fallback.png`,fullPage:true});
  await context.close();
  console.log("mobile_map_provider_failure_fallback=passed");
} finally {
  await browser.close();
}
