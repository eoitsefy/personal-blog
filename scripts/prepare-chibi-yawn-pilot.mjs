// Next action stays offline: expression-only yawn, never imported by runtime.
import sharp from 'sharp';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const run = promisify(execFile), root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = resolve(root, 'docs/assistant/art-pilot-v6'), out = resolve(base, 'followup-yawn');
const tmp = resolve(root, '.tool-tmp/yawn-pilot'), size = 768;
await Promise.all(['keys', 'frames', 'review'].map(name => mkdir(resolve(out, name), { recursive: true })));
await Promise.all(['input', 'output'].map(name => mkdir(resolve(tmp, name), { recursive: true })));
const neutralPath = resolve(base, 'reference/neutral-clean.png');
const neutral = await sharp(neutralPath).ensureAlpha().raw().toBuffer();
const sourcePath = resolve(base, 'generated/yawn-keys-v6.png');
const { data: sheet, info } = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const cw = info.width / 2, ch = info.height / 2, registered = [];
for (let i = 0; i < 4; i++) {
  const ox = i % 2 * cw, oy = Math.floor(i / 2) * ch;
  let top = ch, bottom = -1, left = cw, right = -1;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++)
    if (sheet[((oy + y) * info.width + ox + x) * 4 + 3] > 100) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
  for (let y = bottom - 32; y <= bottom; y++) for (let x = 0; x < cw; x++)
    if (sheet[((oy + y) * info.width + ox + x) * 4 + 3] > 100) { left = Math.min(left, x); right = Math.max(right, x); }
  registered.push({ ox, oy, top, bottom, anchorX: (left + right) / 2, anchorY: bottom + 1 });
}
const scale = 450 / (registered[0].bottom - registered[0].top + 1);
const masks = [[341, 337, 36, 28, 314], [422, 331, 36, 29, 307], [386, 364, 18, 14, 350]];
function mask(x, y) {
  return Math.max(...masks.map(([cx, cy, rx, ry, minY]) => y < minY ? 0 : Math.max(0, Math.min(1, (1 - Math.hypot((x - cx) / rx, (y - cy) / ry)) * 8))));
}
await copyFile(neutralPath, resolve(out, 'keys/00.png'));
for (const [i, pose] of registered.entries()) {
  const candidate = await sharp(sourcePath).extract({ left: pose.ox, top: pose.oy, width: cw, height: ch })
    .resize(Math.round(cw * scale), Math.round(ch * scale)).png().toBuffer();
  const placed = await sharp({ create: { width: size, height: size, channels: 4, background: '#00000000' } })
    .composite([{ input: candidate, left: Math.round(384 - pose.anchorX * scale), top: Math.round(608 - pose.anchorY * scale) }])
    .ensureAlpha().raw().toBuffer();
  const frame = Buffer.from(neutral);
  // Bake one constrained full-frame key. Outside eyes/mouth RGB+alpha are exact
  // original bytes, no body translation or live face/body layers.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const p = (y * size + x) * 4, weight = mask(x, y);
    if (!weight) continue;
    for (let c = 0; c < 3; c++) frame[p + c] = Math.round(frame[p + c] * (1 - weight) + placed[p + c] * weight);
  }
  await sharp(frame, { raw: { width: size, height: size, channels: 4 } }).png().toFile(resolve(out, `keys/0${i + 1}.png`));
}
await copyFile(neutralPath, resolve(out, 'keys/05.png'));
for (let i = 0; i < 6; i++) {
  const frame = await sharp(resolve(out, `keys/0${i}.png`)).ensureAlpha().raw().toBuffer();
  const rgb = Buffer.alloc(size * size * 3);
  for (let p = 0; p < size * size; p++) for (let c = 0; c < 3; c++) rgb[p * 3 + c] = frame[p * 4 + c] * frame[p * 4 + 3] / 255 + 128 * (1 - frame[p * 4 + 3] / 255);
  await sharp(rgb, { raw: { width: size, height: size, channels: 3 } }).png().toFile(resolve(tmp, 'input', String(i).padStart(8, '0') + '.png'));
}
const exe = resolve(root, '.tool-tmp/art-pilot-tools/rife-portable/rife-ncnn-vulkan.exe');
const model = resolve(root, '.tool-tmp/art-pilot-tools/rife-portable/rife-v4.6');
const args = ['-i', resolve(tmp, 'input'), '-o', resolve(tmp, 'output'), '-n', '24', '-m', model, '-g', '1', '-j', '1:1:1', '-f', '%08d.png'];
const start = Date.now(); await run(exe, args, { cwd: dirname(exe), timeout: 120000, maxBuffer: 1000000 });
const frames = [];
for (let i = 0; i < 21; i++) {
  const rgb = await sharp(resolve(tmp, 'output', String(i + 1).padStart(8, '0') + '.png')).removeAlpha().raw().toBuffer();
  const frame = Buffer.from(neutral);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!mask(x, y)) continue;
    const p = y * size + x, alpha = frame[p * 4 + 3] / 255;
    if (!alpha) continue;
    for (let c = 0; c < 3; c++) frame[p * 4 + c] = Math.max(0, Math.min(255, Math.round((rgb[p * 3 + c] - 128 * (1 - alpha)) / alpha)));
  }
  const file = resolve(out, 'frames', String(i).padStart(3, '0') + '.png');
  if (i === 0 || i === 20) await copyFile(neutralPath, file);
  else await sharp(frame, { raw: { width: size, height: size, channels: 4 } }).png().toFile(file);
  frames.push(await readFile(file));
}
const delay = frames.map(() => 67); delay[20] = 3000 - 20 * 67;
await sharp(frames, { join: { animated: true } }).webp({ lossless: true, effort: 6, loop: 0, delay }).toFile(resolve(out, 'yawn-15fps.webp'));
for (const background of ['#f4f1e9', '#181e25']) {
  const tiles = await Promise.all(frames.map(async (file, i) => ({ input: await sharp(file).extract({ left: 176, top: 144, width: 416, height: 512 }).resize(208, 256).png().toBuffer(), left: i % 6 * 208, top: Math.floor(i / 6) * 256 })));
  await sharp({ create: { width: 1248, height: 1024, channels: 4, background } }).composite(tiles).png().toFile(resolve(out, 'review', background === '#181e25' ? 'all-dark.png' : 'all-light.png'));
}
await writeFile(resolve(out, 'provenance.json'), JSON.stringify({ status: 'PENDING_VISUAL_REVIEW_NOT_RUNTIME', frames: 21,
  actualGeneratedKeys: 4, unchangedRegions: 'all pixels outside eyes and mouth; exact neutral alpha everywhere', registered, sharedScale: scale,
  masks, rife: { model: 'v4.6', elapsedMs: Date.now() - start, gpu: 1, requestedFrames: 24, retainedFrames: 21 },
  authorizesDeployment: false, noPaidAPI: true, changesArmPose: false }, null, 2) + '\n');
console.log('Offline expression-yawn: 4 generated keys + 21 PNG frames, visual review required');
