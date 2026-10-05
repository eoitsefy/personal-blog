// Offline full-frame authoring only. Existing owner-requested fixed registration
// and static-pixel protection; no public runtime rig, GPU call or deployment.
import sharp from 'sharp';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'docs/assistant/wave-keyframes-v7');
const size = 768, sourceSize = 1254, scale = size / sourceSize, anchor = { x: 384, y: 608 };
const baseline = resolve(root, 'docs/assistant/art-pilot-v6/reference/neutral-clean.png');
const neutral = await sharp(baseline).ensureAlpha().raw().toBuffer();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
await Promise.all(['keys', 'registered', 'review'].map(folder => mkdir(resolve(out, folder), { recursive: true })));
await copyFile(baseline, resolve(out, 'reference/neutral-clean.png'));
await copyFile(baseline, resolve(out, 'keys/00-neutral.png'));
const specs = [
  { name: 'prep', file: '01-prep.png', polygon: [[266,398],[319,398],[332,527],[270,527],[260,470]], hand: [283,474,48,39] },
  { name: 'return', file: '02-middle.png', polygon: [[257,398],[319,398],[334,527],[272,527],[253,465]], hand: [270,409,48,43] },
  { name: 'peak', file: '03-peak.png', polygon: [[220,350],[287,350],[290,391],[319,398],[334,527],[272,527],[259,463],[227,411]], hand: [229,351,62,54] },
];
function inside(polygon, x, y) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) result = !result;
  }
  return result;
}
function weight(spec, x, y) {
  if (!inside(spec.polygon, x, y)) return 0;
  const p = (y * size + x) * 4;
  // Preserve original hair/face/headset; do not hide overlap failures in review.
  if (y < 400 && neutral[p + 3] >= 8) return 0;
  // The collar is static. Keep its exact contour instead of cutting a new
  // sleeve along the polygon's flat top edge; blend only below the joint.
  if (x >= 298 && y < 408) return 0;
  const boundary = y < 430 ? 321 + (y - 398) * .05 : Math.min(331, 323 + (y - 430) * .13);
  const collarBlend = x >= 298 ? Math.max(0, Math.min(1, (y - 408) / 6)) : 1;
  return Math.max(0, Math.min(1, (boundary - x) / 4)) * collarBlend;
}
const report = { status: 'PENDING_VISUAL_REVIEW', releaseAllowed: false, newGeneratedPoses: 3,
  sharedScale: scale, canvas: { width: size, height: size, safetyInset: .2, anchor },
  neutralRgbaSha256: hash(neutral), method: 'shared scale plus sole registration; only moving-arm region is replaced in baked whole-frame PNG',
  originalHeadTorsoAndFeetProtected: true, gpuUsed: false, interpolationRun: false, poses: [] };
const frames = [resolve(out, 'keys/00-neutral.png')];
for (const spec of specs) {
  const source = resolve(out, 'generated', spec.name + '.png');
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== sourceSize || info.height !== sourceSize) throw Error('Unexpected generated canvas; do not rescale each pose independently');
  let bottom = -1, left = info.width, right = -1;
  for (let y = 900; y < info.height; y++) for (let x = 450; x < 810; x++)
    if (data[(y * info.width + x) * 4 + 3] >= 100) bottom = Math.max(bottom, y);
  if (bottom < 950) throw Error('Missing original sole registration');
  for (let y = bottom - 24; y <= bottom; y++) for (let x = 450; x < 810; x++)
    if (data[(y * info.width + x) * 4 + 3] >= 100) { left = Math.min(left, x); right = Math.max(right, x); }
  const sourceAnchor = { x: (left + right) / 2, y: bottom + 1 };
  const translation = { left: Math.round(anchor.x - sourceAnchor.x * scale), top: Math.round(anchor.y - sourceAnchor.y * scale) };
  const resized = await sharp(source).resize(size, size, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer();
  const placed = Buffer.alloc(neutral.length);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = x - translation.left, sy = y - translation.top;
    if (sx >= 0 && sx < size && sy >= 0 && sy < size) resized.copy(placed, (y * size + x) * 4, (sy * size + sx) * 4, (sy * size + sx) * 4 + 4);
  }
  await sharp(placed, { raw: { width: size, height: size, channels: 4 } }).png().toFile(resolve(out, 'registered', spec.name + '.png'));
  const frame = Buffer.from(neutral);
  let headSkinOverlap = 0;
  const [hx, hy, hw, hh] = spec.hand;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const p = (y * size + x) * 4;
    if (x >= hx && x < hx + hw && y >= hy && y < hy + hh && y < 400 && neutral[p + 3] >= 100 &&
      placed[p + 3] >= 200 && placed[p] > placed[p + 1] + 8 && placed[p + 1] > placed[p + 2] + 8 && placed[p] > 160) headSkinOverlap++;
    const w = weight(spec, x, y);
    if (!w) continue;
    const oldAlpha = neutral[p + 3] / 255, newAlpha = placed[p + 3] / 255;
    const alpha = oldAlpha * (1 - w) + newAlpha * w;
    for (let c = 0; c < 3; c++) frame[p + c] = alpha ? Math.round((neutral[p + c] * oldAlpha * (1 - w) + placed[p + c] * newAlpha * w) / alpha) : 0;
    frame[p + 3] = Math.round(alpha * 255);
  }
  let l = size, t = size, r = -1, b = -1, outsideChanges = 0, footChanges = 0, skinOpaque = 0, skinTranslucent = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const p = (y * size + x) * 4, changed = frame.subarray(p, p + 4).compare(neutral.subarray(p, p + 4)) !== 0;
    if (changed && !weight(spec, x, y)) outsideChanges++;
    if (changed && y >= 527) footChanges++;
    if (frame[p + 3] >= 8) { l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y); }
    if (x >= hx && x < hx + hw && y >= hy && y < hy + hh && frame[p + 3] >= 20 && frame[p] > frame[p + 1] + 8 && frame[p + 1] > frame[p + 2] + 8 && frame[p] > 160) {
      if (frame[p + 3] >= 245) skinOpaque++; else skinTranslucent++;
    }
  }
  const safeMargins = [l, t, size - 1 - r, size - 1 - b].every(v => v >= Math.ceil(size * .2));
  const file = resolve(out, 'keys', spec.file);
  await sharp(frame, { raw: { width: size, height: size, channels: 4 } }).png().toFile(file);
  frames.push(file);
  const skinTranslucentRatio = skinTranslucent / Math.max(1, skinOpaque + skinTranslucent);
  report.poses.push({ name: spec.name, sourceSha256: hash(await readFile(source)), rgbaSha256: hash(frame), sourceAnchor, translation,
    polygon: spec.polygon, handInspectionBox: spec.hand, bounds: [l,t,r,b], outsideChanges, footChanges,
    safeMargins, headSkinOverlapBeforeProtection: headSkinOverlap, skinOpaque, skinTranslucent, skinTranslucentRatio,
    passed: outsideChanges === 0 && footChanges === 0 && safeMargins && headSkinOverlap === 0 && skinOpaque > 50 && skinTranslucentRatio < .05 });
}
report.artScopeSha256 = hash(Buffer.from(report.neutralRgbaSha256 + report.poses.map(p => p.rgbaSha256).join('')));
if (report.poses.some(p => !p.passed)) report.status = 'REJECTED_TECHNICAL';
for (const theme of ['light', 'dark']) {
  const background = theme === 'light' ? '#f4f1e9' : '#181e25';
  const tiles = await Promise.all(frames.map(async (file, index) => ({ input: await sharp(file).extract({ left: 176, top: 144, width: 416, height: 512 }).resize(333, 410).png().toBuffer(), left: index * 333, top: 0 })));
  await sharp({ create: { width: 1332, height: 410, channels: 4, background } }).composite(tiles).png().toFile(resolve(out, 'review', `keys-${theme}.png`));
  const details = await Promise.all(frames.map(async (file, index) => ({ input: await sharp(file).extract({ left: 210, top: 344, width: 137, height: 186 }).resize(274, 372).png().toBuffer(), left: index * 274, top: 0 })));
  await sharp({ create: { width: 1096, height: 372, channels: 4, background } }).composite(details).png().toFile(resolve(out, 'review', `arm-${theme}.png`));
}
await writeFile(resolve(out, 'review/automatic.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (report.status === 'REJECTED_TECHNICAL') process.exitCode = 1;
