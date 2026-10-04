// Read-only visual identity gate. Compare rendered pixels with the original
// registered neutral pose, not only animation data attributes or sprite bounds.
// Screenshots must still be inspected by a human: ratios do not prove artistry.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sharp = require('sharp');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3220';
if (!['localhost', '127.0.0.1', 'eastherphil.cn'].includes(new URL(base).hostname)) throw Error('Unexpected target');
const output = resolve(process.env.RIG_IDENTITY_OUTPUT || '.tool-tmp/rig-identity');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const errors = [], failures = [], results = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

function components(frame, predicate, box) {
  const { data, width, height } = frame, seen = new Uint8Array(width * height), found = [];
  for (let y = box.top; y <= box.bottom; y++) for (let x = box.left; x <= box.right; x++) {
    const index = y * width + x;
    if (seen[index] || !predicate(data, index * 4)) continue;
    const queue = [index]; seen[index] = 1;
    let count = 0, left = x, right = x, top = y, bottom = y, sumX = 0, sumY = 0;
    for (let next = 0; next < queue.length; next++) {
      const current = queue[next], cx = current % width, cy = Math.floor(current / width);
      count++; sumX += cx; sumY += cy;
      left = Math.min(left, cx); right = Math.max(right, cx); top = Math.min(top, cy); bottom = Math.max(bottom, cy);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = cx + dx, ny = cy + dy, ni = ny * width + nx;
        if (nx < box.left || nx > box.right || ny < box.top || ny > box.bottom || ny >= height || seen[ni] || !predicate(data, ni * 4)) continue;
        seen[ni] = 1; queue.push(ni);
      }
    }
    if (count >= 3) found.push({ count, left, right, top, bottom, x: sumX / count, y: sumY / count, width: right - left + 1, height: bottom - top + 1 });
  }
  return found;
}

function metrics(frame, eyeColour = 'gold') {
  const { data, width, height } = frame;
  let top = height, bottom = -1, left = width, right = -1;
  const rows = [];
  for (let y = 0; y < height; y++) {
    let l = width, r = -1;
    for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 100) {
      l = Math.min(l, x); r = Math.max(r, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      left = Math.min(left, x); right = Math.max(right, x);
    }
    rows.push({ y, span: r >= l ? r - l + 1 : 0 });
  }
  assert.ok(bottom > top, 'Rendered character is empty');
  const h = bottom - top + 1, w = right - left + 1, centre = (left + right) / 2;
  const headWidth = Math.max(...rows.filter(row => row.y >= top && row.y <= top + h * .54).map(row => row.span));
  const neck = rows.filter(row => row.y >= top + h * .44 && row.y <= top + h * .64 && row.span > 0).sort((a, b) => a.span - b.span)[0];
  const box = (x0, x1, y0, y1) => ({ left: Math.ceil(left + w * x0), right: Math.floor(left + w * x1), top: Math.ceil(top + h * y0), bottom: Math.floor(top + h * y1) });
  const amber = (d, i) => d[i + 3] > 150 && d[i] > 105 && d[i + 1] > 65 && d[i + 2] < 120 && d[i] > d[i + 1] * 1.05 && d[i + 1] > d[i + 2] * 1.35;
  const blue = (d, i) => d[i + 3] > 150 && d[i + 2] > 85 && d[i + 2] > d[i] * 1.18 && d[i + 2] > d[i + 1] * 1.02 && d[i + 2] - d[i] > 15;
  // Restrict to the facial band: jacket gold at the neckline must not be
  // mistaken for larger pupils when comparing the original black/gold skin.
  const pupils = components(frame, eyeColour === 'blue' ? blue : amber, box(.25, .75, .26, .45)).filter(c => c.height >= 3 && c.height / c.width < 2 && c.width / c.height < 3);
  let pair, score = -Infinity;
  for (const a of pupils) for (const b of pupils) {
    if (a.x >= centre || b.x <= centre || Math.abs(a.y - b.y) > h * .045) continue;
    const value = Math.min(a.count, b.count) - Math.abs(a.count - b.count) * .3 - Math.abs(a.y - b.y) * 3;
    if (value > score) { score = value; pair = [a, b]; }
  }
  const skin = (d, i) => d[i + 3] > 150 && d[i] > 175 && d[i + 1] > 112 && d[i + 2] > 78 && d[i] - d[i + 1] > 10 && d[i + 1] - d[i + 2] > 7;
  const handLeft = components(frame, skin, box(.08, .35, .65, .88));
  const handRight = components(frame, skin, box(.65, .92, .65, .88));
  const hands = [handLeft.sort((a, b) => b.count - a.count)[0], handRight.sort((a, b) => b.count - a.count)[0]];
  const feet = box(0, 1, .92, 1);
  let feetSum = 0, feetCount = 0;
  for (let y = feet.top; y <= feet.bottom; y++) for (let x = feet.left; x <= feet.right; x++) if (data[(y * width + x) * 4 + 3] > 100) { feetSum += x; feetCount++; }
  return { bounds: { top, bottom, left, right, width: w, height: h }, headWidth, headHeightRatio: (neck.y - top) / h,
    eyeAreaRatio: pair ? (pair[0].width * pair[0].height + pair[1].width * pair[1].height) / (headWidth * headWidth) : 0,
    eyeColourAreaRatio: pair ? (pair[0].count + pair[1].count) / (headWidth * headWidth) : 0,
    eyeWidthRatio: pair ? (pair[0].width + pair[1].width) / (2 * headWidth) : 0,
    eyeLevelRatio: pair ? ((pair[0].y + pair[1].y) / 2 - top) / h : null,
    eyeComponents: pair || [], handAreaRatio: hands.every(Boolean) ? (hands[0].count + hands[1].count) / (h * h) : 0,
    handComponents: hands, feetCentre: feetSum / feetCount,
    // Use boot level only; dangling hands at thigh level must not inflate the
    // leg-width metric and hide the original character's heavier boot shape.
    legWidthRatio: Math.max(...rows.filter(row => row.y >= top + h * .92).map(row => row.span)) / w };
}

function diff(a, b, box) {
  let changed = 0, total = 0, magnitude = 0;
  for (let y = box.top; y < box.bottom; y++) for (let x = box.left; x < box.right; x++) {
    const i = (y * a.width + x) * 4;
    const delta = Math.max(...[0, 1, 2, 3].map(channel => Math.abs(a.data[i + channel] - b.data[i + channel])));
    if (delta > 8) changed++; magnitude += delta; total++;
  }
  return { changed, ratio: changed / total, mean: magnitude / total };
}

async function capture(canvas, name, time = 0) {
  await canvas.evaluate((element, t) => { const clock = element.getAnimations()[0]; if (clock) { clock.pause(); clock.currentTime = t; } }, time);
  await canvas.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const uri = await canvas.evaluate(element => element.toDataURL('image/png'));
  const png = Buffer.from(uri.split(',')[1], 'base64');
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (name) { await writeFile(resolve(output, `${name}-intrinsic.png`), png); await canvas.screenshot({ path: resolve(output, `${name}.png`) }); }
  return { data, width: info.width, height: info.height, uri };
}

async function board(items, filename) {
  const context = await browser.newContext({ viewport: { width: 984, height: 560 } });
  const page = await context.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.evaluate(entries => {
    const node = document.createElement('section'); node.id = 'rig-identity-board';
    Object.assign(node.style, { position: 'fixed', left: '0', top: '0', zIndex: '2147483647', display: 'grid', gridTemplateColumns: 'repeat(4, 224px)', gap: '8px', padding: '16px', background: '#f9f7ee', color: '#222', font: '14px sans-serif', width: '944px' });
    entries.forEach(item => { const figure = document.createElement('figure'); figure.style.margin = '0'; const image = document.createElement('img'); image.src = item.uri; image.width = image.height = 224; const label = document.createElement('figcaption'); label.textContent = item.label; figure.append(image, label); node.append(figure); });
    document.body.append(node);
  }, items);
  await page.locator('#rig-identity-board').screenshot({ path: resolve(output, filename) });
  await context.close();
}

try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage();
    let queries = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/assistant/query') queries++; });
    await page.goto(base); await page.waitForSelector('canvas[data-ready=true]');
    await page.getByRole('button', { name: '打开小助手对话', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '小助手', exact: true });
    await dialog.getByRole('combobox', { name: '助手形象' }).selectOption('classic');
    await page.waitForSelector('dialog canvas[data-ready=true]');
    await dialog.getByRole('button', { name: '暂停动作', exact: true }).click();
    const original = await capture(dialog.locator('canvas'), `original-neutral-${width}`), reference = metrics(original);
    check(reference.eyeAreaRatio > 0, `Original eye detector unavailable at ${width}`);
    await dialog.getByRole('button', { name: '开启动作', exact: true }).click();
    const skins = (process.env.RIG_IDENTITY_SKINS || 'gold,mist').split(',');
    for (const skin of skins) {
      await dialog.getByRole('combobox', { name: '助手形象' }).selectOption(skin);
      await page.waitForSelector(`dialog [data-engine=rig][data-skin=${skin}] canvas[data-ready=true]`);
      const canvas = dialog.locator('canvas');
      await dialog.getByRole('button', { name: '暂停动作', exact: true }).click();
      const neutral = await capture(canvas, `${skin}-neutral-${width}`), current = metrics(neutral, skin === 'mist' ? 'blue' : 'gold');
      const ratios = { headHeight: current.headHeightRatio / reference.headHeightRatio,
        eyeArea: current.eyeAreaRatio / reference.eyeAreaRatio, eyeColourArea: current.eyeColourAreaRatio / reference.eyeColourAreaRatio,
        eyeWidth: current.eyeWidthRatio / reference.eyeWidthRatio,
        hands: current.handAreaRatio / reference.handAreaRatio, legs: current.legWidthRatio / reference.legWidthRatio };
      check(ratios.headHeight >= .85 && ratios.headHeight <= 1.15, `${skin}/${width}: head/body proportion drift ${ratios.headHeight}`);
      check(ratios.eyeArea >= .75 && ratios.eyeArea <= 1.4, `${skin}/${width}: eyes materially smaller/larger than original ${ratios.eyeArea}`);
      // For the same gold hue, coloured area is a second check against squinted
      // eyes. Blue and gold classifiers do not have comparable saturation area.
      if (skin === 'gold') check(ratios.eyeColourArea >= .75 && ratios.eyeColourArea <= 1.4, `${skin}/${width}: gold iris colour footprint drift ${ratios.eyeColourArea}`);
      check(ratios.eyeWidth >= .8 && ratios.eyeWidth <= 1.3, `${skin}/${width}: iris width drift ${ratios.eyeWidth}`);
      check(ratios.hands >= .65 && ratios.hands <= 1.5, `${skin}/${width}: hand skin silhouette drift ${ratios.hands}`);
      check(ratios.legs >= .75 && ratios.legs <= 1.3, `${skin}/${width}: lower-body width drift ${ratios.legs}`);
      check(Math.abs(current.eyeLevelRatio - reference.eyeLevelRatio) < .06, `${skin}/${width}: eye placement drift`);
      await dialog.getByRole('button', { name: '开启动作', exact: true }).click();
      const actions = [];
      for (const [label, action, duration] of [['挥手', 'wave', 1800], ['打哈欠', 'yawn', 2600], ['点头', 'nod', 1500], ['思考', 'thinking', 2400], ['鞠躬', 'bow', 2000], ['开心', 'cheer', 1800]]) {
        await dialog.getByRole('button', { name: `播放${label}动作`, exact: true }).click();
        await page.waitForSelector('dialog canvas[data-ready=true]');
        const frames = [], articulatingArm = action === 'wave' || action === 'yawn';
        if (articulatingArm) for (let index = 0; index < 9; index++) frames.push(await capture(canvas, null, duration * .17 + index * 16));
        const peak = await capture(canvas, `${skin}-${action}-${width}`, duration * .5);
        const armBox = { left: 15, right: 103, top: 40, bottom: 195 }, feetBox = { left: 30, right: 195, top: 200, bottom: 224 };
        const transitions = frames.slice(1).map((frame, index) => diff(frames[index], frame, armBox));
        const changedSteps = transitions.filter(step => step.changed >= 4).length;
        if (articulatingArm) check(changedSteps >= 6, `${skin}/${width}/${action}: actual arm pixels are not continuously changing (${changedSteps}/8)`);
        check(transitions.every(step => step.ratio < .16), `${skin}/${width}/${action}: discontinuous visual jump`);
        const feetChange = diff(neutral, peak, feetBox), armChange = diff(neutral, peak, armBox);
        check(feetChange.ratio < .03, `${skin}/${width}/${action}: real foot pixels move`);
        if (articulatingArm) check(armChange.ratio > .035, `${skin}/${width}/${action}: arm does not visibly articulate`);
        actions.push({ action, continuityMeasured: articulatingArm, changedSteps: articulatingArm ? changedSteps : null, transitions, feetChange, armChange });
        await board([{ label: '原版第一帧', uri: original.uri }, { label: `${skin} 初始`, uri: neutral.uri }, { label: `${skin} ${label}`, uri: peak.uri }], `${skin}-${action}-comparison-${width}.png`);
        const stages = [];
        for (const fraction of [.16, .46, .74]) {
          const intermediate = await capture(canvas, null, duration * fraction), poseBounds = metrics(intermediate).bounds;
          check(poseBounds.top >= 3 && poseBounds.bottom <= 215 && poseBounds.left >= 3 && poseBounds.right < 221, `${skin}/${width}/${action}: incomplete character at ${fraction}`);
          stages.push({ label: `${label} ${Math.round(fraction * 100)}%`, uri: intermediate.uri });
        }
        await board([{ label: `${skin} 初始`, uri: neutral.uri }, ...stages], `${skin}-${action}-stages-${width}.png`);
        if (action !== 'thinking') {
          await canvas.evaluate(element => element.getAnimations()[0].finish());
          await page.waitForFunction(() => document.querySelector('dialog canvas')?.getAnimations()[0]?.effect?.getTiming().duration === 6000);
        }
      }
      results.push({ width, skin, original: reference, rig: current, ratios, actions });
    }
    check(queries === 0, `${width}: visual test sent an AI request`);
    check(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), `${width}: dialog overflows`);
    await context.close();
  }
  check(errors.length === 0, `Browser errors: ${JSON.stringify(errors)}`);
  const report = { accepted: failures.length === 0, target: base, requiresHumanScreenshotReview: true, output, failures, results };
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ accepted: report.accepted, target: base, output, failures,
    results: results.map(({ width, skin, ratios, actions }) => ({ width, skin, ratios, actions: actions.map(({ action, continuityMeasured, changedSteps, feetChange }) => ({ action, continuityMeasured, changedSteps, fixedFeet: feetChange.ratio < .03 })) })) }, null, 2));
  assert.deepEqual(failures, [], 'Character identity/pixel animation gate failed; inspect saved comparison screenshots');
} finally { await browser.close(); }
