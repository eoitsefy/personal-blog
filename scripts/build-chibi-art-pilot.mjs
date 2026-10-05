// Offline full-figure PNG authoring/QA. No production character module imports.
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'docs/assistant/art-pilot-v6');
const S = 768, pixels = S * S;
const raw = async path => (await sharp(path).ensureAlpha().raw().toBuffer()).subarray();
const save = (data, name) => sharp(data, { raw: { width: S, height: S, channels: 4 } }).png().toFile(resolve(out, name));
const metadata = { stage: S, sharedWaveScale: 450 / 460, adjustments: [], sourceRegistration: [] };
await mkdir(resolve(out, 'keys'), { recursive: true });
await mkdir(resolve(out, 'raw-registered'), { recursive: true });

function cleanAlpha(input) {
 const data = Buffer.from(input), seen = new Uint8Array(pixels);
 let removed = 0;
 // Remove only isolated alpha components <12 pixels; retain fine connected hair.
 for (let p = 0; p < pixels; p++) if (!seen[p] && data[p * 4 + 3] >= 8) {
  const component = [p]; seen[p] = 1;
  for (let q = 0; q < component.length; q++) {
   const here = component[q], x = here % S, y = Math.floor(here / S);
   for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy, next = ny * S + nx;
    if (nx < 0 || ny < 0 || nx >= S || ny >= S || seen[next] || data[next * 4 + 3] < 8) continue;
    seen[next] = 1; component.push(next);
   }
  }
  if (component.length < 12) { for (const p of component) data.fill(0, p * 4, p * 4 + 4); removed += component.length; }
 }
 const before = Buffer.from(data);
 // Subpixel matte choke, not a hard color key. Never changes opaque RGB.
 for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
  const p = (y * S + x) * 4;
  let min = before[p + 3];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) min = Math.min(min, before[((y + dy) * S + x + dx) * 4 + 3]);
  data[p + 3] = Math.round(before[p + 3] * .65 + min * .35);
  if (data[p + 3] < 8) data.fill(0, p, p + 4);
 }
 return { data, isolatedPixelsRemoved: removed };
}
const original = await raw(resolve(out, 'reference/neutral.png'));
const cleaned = cleanAlpha(original);
const neutral = cleaned.data;
await save(neutral, 'reference/neutral-clean.png');
metadata.adjustments.push({ type: 'same-source-alpha-cleanup', isolatedPixelsRemoved: cleaned.isolatedPixelsRemoved, erosion: '.35 of 3x3 alpha minimum', colorKey: false });

const blinkSource = resolve(out, 'generated/blink-closed-v6.png');
const blinkBytes = await sharp(blinkSource).resize(S, S, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer();
await save(blinkBytes, 'raw-registered/blink-closed.png');
// Raw generation changes parts of the costume/mouth: keep that failed evidence.
// The only permitted generated pixels for the adjusted blink are the eye ROIs.
function blinkMask(x, y) {
 let mask = 0;
 for (const [cx, cy, rx, ry, minY] of [[341, 337, 36, 28, 314], [422, 331, 36, 29, 307]]) {
  if (y < minY) continue;
  const d = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
  mask = Math.max(mask, Math.min(1, Math.max(0, (1 - d) * 8)));
 }
 return mask;
}
function mixPixels(base, candidate, maskFn) {
 const data = Buffer.from(base);
 for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const mix = maskFn(x, y), p = (y * S + x) * 4;
  if (mix === 0) continue;
  const a = base[p + 3] / 255, b = candidate[p + 3] / 255;
  const alpha = a * (1 - mix) + b * mix;
  for (let c = 0; c < 3; c++) data[p + c] = alpha ? Math.round((base[p + c] * a * (1 - mix) + candidate[p + c] * b * mix) / alpha) : 0;
  data[p + 3] = Math.round(alpha * 255);
 }
 return data;
}
const closed = mixPixels(neutral, blinkBytes, blinkMask);
await save(neutral, 'keys/blink-00.png');
await save(closed, 'keys/blink-01.png');
await save(neutral, 'keys/blink-02.png');
const halfBytes = await sharp(resolve(out,'generated/blink-half-v6.png')).resize(S,S,{kernel:'lanczos3'}).ensureAlpha().raw().toBuffer();
await save(halfBytes,'raw-registered/blink-half.png');
await save(mixPixels(neutral,halfBytes,blinkMask),'keys/blink-03.png');
metadata.adjustments.push({ type: 'blink-static-pixel-protection', editableEyes: [[341,337,36,28,314],[422,331,36,29,307]], outsideUnchanged: true });

const sheetPath = resolve(out, 'generated/wave-keys-v6b.png');
const sheet = await sharp(sheetPath).ensureAlpha().raw().toBuffer();
const rects = [];
function waveMask(x, y) {
 // A baked image-edit ROI, not a runtime arm transform or skeleton.
 if (x < 185 || x > 355 || y < 321 || y > 527) return 0;
 const edge = Math.min(x - 185, 355 - x, y - 321, 527 - y);
 return Math.min(1, Math.max(0, edge / 5));
}
// Equal cells: one integer XY registration of each source, one shared scale.
// These transforms are baked into whole PNGs; no live crop/scale or limb rig.
for (let index = 0; index < 6; index++) {
 const col = index % 3, row = Math.floor(index / 3), originX = col * 512, originY = row * 512;
 let l = 512, r = -1, bottom = -1;
 for (let y = 400; y < 500; y++) for (let x = 150; x < 390; x++) {
  const p = ((originY + y) * 1536 + originX + x) * 4;
  if (sheet[p + 3] < 200) continue;
  l = Math.min(l, x); r = Math.max(r, x); bottom = Math.max(bottom, y);
 }
 const anchorX = (l + r) / 2;
 const scale = metadata.sharedWaveScale;
 const tile = await sharp(sheetPath).extract({ left: originX, top: originY, width: 512, height: 512 })
  .resize(Math.round(512 * scale), Math.round(512 * scale), { kernel: 'lanczos3' }).png().toBuffer();
 const left = Math.round(384 - anchorX * scale), top = Math.round(608 - bottom * scale);
 const image = await sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: tile, left, top }]).ensureAlpha().raw().toBuffer();
 await save(image, `raw-registered/wave-${String(index + 1).padStart(2,'0')}.png`);
 const adjusted = mixPixels(neutral, cleanAlpha(image).data, waveMask);
 // Restore the exact original head on top. The corrected hand stays outside
 // it; all head/face/headset pixels and the stationary body stay identical.
 for (let y = 155; y < 398; y++) for (let x = 236; x < 530; x++) {
  const p = (y * S + x) * 4;
  if (neutral[p + 3] >= 8) neutral.copy(adjusted, p, p, p + 4);
 }
 await save(adjusted, `keys/wave-${String(index + 1).padStart(2,'0')}.png`);
 rects.push({ index, sourceCell: { left: originX, top: originY, width: 512, height: 512 }, sourceFoot: { x: anchorX, y: bottom }, scale, integerRegistration: { left, top } });
}
metadata.sourceRegistration = rects;
await save(neutral, 'keys/wave-00.png');
await save(neutral, 'keys/wave-07.png');
metadata.adjustments.push({ type: 'wave-static-pixel-protection', editableRoi: [185,321,355,527], originalHeadPreserved: [236,155,530,398], outsideUnchanged: true, source: 'generated/wave-keys-v6b.png' });
await writeFile(resolve(out, 'key-preparation.json'), JSON.stringify(metadata, null, 2) + '\n');
const files = ['reference/neutral-clean.png','raw-registered/blink-closed.png','keys/blink-01.png',...rects.map((_,i)=>`keys/wave-${String(i+1).padStart(2,'0')}.png`)];
const tiles = await Promise.all(files.map(async(name,index)=>({ input: await sharp(resolve(out,name)).resize(384,384).png().toBuffer(), left: (index % 3)*384, top: Math.floor(index/3)*384 })));
await sharp({ create: { width: 1152, height: 1152, channels: 4, background: '#f3f0e8' } }).composite(tiles).png().toFile(resolve(out,'key-contact.png'));
console.log(JSON.stringify({ out, status: 'key-candidates-art-review-required', generatedFiles: 4, registeredKeys: 12 }, null, 2));
