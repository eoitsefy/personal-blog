// Isolated candidate packaging only. Never edits production assets or grants approval.
// node --import tsx scripts/animation/package-selected-candidate-v7.mjs
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { naturalRgbaHash, naturalManifestScope } from './validate-natural-motion-assets.mjs';
import { validNaturalRuntime, validNaturalMotion } from '../../src/lib/assistant/natural-motion.ts';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const work = await realpath(join(root, 'docs/assistant/cloud-motion-suite-v1/batch-v3/selected-repair-v1'));
const source = await realpath(join(work, 'transition-v7'));
const out = join(work, 'staging-v7');
const publicRoot = await realpath(join(root, 'public'));
const oldPath = join(root, 'src/lib/assistant/releases/natural-cloud-wave-hand-v3-matte-v6b/manifest.json');
const oldBytes = await readFile(oldPath);
const old = JSON.parse(oldBytes);
const transitionBytes = await readFile(join(source, 'report.json'));
const transition = JSON.parse(transitionBytes);
const version = 'natural-selected-actions-v7', size = 480, limit = 64 * 1024 * 1024;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (base, path) => { const r = relative(base, path); return r && !r.startsWith('..') && !isAbsolute(r); };
assert(inside(work, source), 'Transition source escaped isolated workspace');
assert.equal(old.width, size); assert.equal(old.height, size);
assert(validNaturalRuntime(old), 'Existing release structure invalid');
assert.deepEqual(Object.keys(old.clips).sort(), ['idle', 'wave']);

function normalize(bytes) {
  const pixels = Buffer.from(bytes);
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] === 0) pixels.fill(0, i, i + 3);
  return pixels;
}
function crop(page, frame) {
  assert(frame.x >= 0 && frame.y >= 0 && frame.x + size <= page.width && frame.y + size <= page.height);
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const from = ((frame.y + y) * page.width + frame.x) * 4;
    page.data.copy(pixels, y * size * 4, from, from + size * 4);
  }
  return normalize(pixels);
}
async function decode(bytes, width, height) {
  const meta = await sharp(bytes).metadata();
  assert(meta.width === width && meta.height === height && meta.hasAlpha && (meta.pages ?? 1) === 1, 'Invalid still RGBA dimensions');
  return normalize(await sharp(bytes).toColourspace('srgb').ensureAlpha().raw().toBuffer());
}
async function existingFile(src) {
  assert(/^\/assistant\/[a-zA-Z0-9_./-]+\.webp$/.test(src) && !src.includes('..'));
  const path = await realpath(join(publicRoot, src.slice(1)));
  assert(inside(publicRoot, path), 'Existing public asset escaped root');
  return path;
}

// Verify the inherited bytes, frame crops and static anchor, not just their claims.
const inherited = [], oldPages = new Map(), unique = new Map();
for (const [key, asset] of Object.entries(old.assets)) {
  const bytes = await readFile(await existingFile(asset.src));
  assert.equal(sha(bytes), asset.sha256, `Inherited file changed: ${key}`);
  const data = await decode(bytes, asset.width, asset.height);
  oldPages.set(key, { data, width: asset.width, height: asset.height });
  inherited.push({ key, src: asset.src, sha256: asset.sha256, bytes: bytes.length });
}
let anchorPixels;
for (const [action, clip] of Object.entries(old.clips)) for (const [index, frame] of clip.frames.entries()) {
  const pixels = crop(oldPages.get(frame.asset), frame);
  assert.equal(naturalRgbaHash(pixels), frame.rgbaSha256, `Inherited frame changed: ${action}/${index}`);
  if (!unique.has(frame.rgbaSha256)) unique.set(frame.rgbaSha256, { asset: frame.asset, x: frame.x, y: frame.y, rgbaSha256: frame.rgbaSha256 });
  if (action === 'idle' && index === 0) anchorPixels = pixels;
}
const stillBytes = await readFile(await existingFile(old.still.src));
assert.equal(sha(stillBytes), old.still.sha256);
assert((await decode(stillBytes, size, size)).equals(anchorPixels), 'Actual fallback does not match anchor');
assert.equal(naturalRgbaHash(anchorPixels), old.anchorRgbaSha256);

const clips = structuredClone(old.clips), pages = [], sources = [], rawFrames = new Map();
for (const action of ['bow', 'thinking']) {
  const timing = transition.motions[action];
  assert.equal(timing.frames, 65, `${action}: expected 65 frames`);
  assert(Array.isArray(timing.durationsMs) && timing.durationsMs.length === 65);
  assert(timing.durationsMs.every(ms => Number.isInteger(ms) && ms >= 16 && ms <= 1000));
  assert(timing.durationsMs.reduce((a, b) => a + b, 0) <= 30000);
  clips[action] = { frames: [] }; let current = null;
  for (let index = 0; index < 65; index++) {
    const path = await realpath(join(source, action, 'frames', `frame-${String(index).padStart(3, '0')}.png`));
    assert(inside(source, path));
    const bytes = await readFile(path), pixels = await decode(bytes, size, size), digest = naturalRgbaHash(pixels);
    if (index === 0 || index === 64) {
      assert.equal(digest, old.anchorRgbaSha256, `${action} endpoint hash mismatch`);
      assert(pixels.equals(anchorPixels), `${action} endpoint pixel mismatch`);
    }
    let slot = unique.get(digest);
    if (!slot) {
      if (!current || current.slots.length === 16) {
        current = { key: `selected-${action}-${pages.length}`, slots: [] }; pages.push(current);
      }
      const n = current.slots.length;
      slot = { asset: current.key, x: n % 4 * size, y: Math.floor(n / 4) * size, rgbaSha256: digest };
      current.slots.push({ ...slot, pixels }); unique.set(digest, slot);
    }
    clips[action].frames.push({ ...slot, durationMs: timing.durationsMs[index] });
    rawFrames.set(`${action}:${index}`, pixels);
    sources.push({ action, index, path: relative(work, path).replaceAll('\\', '/'), fileSha256: sha(bytes), rgbaSha256: digest });
  }
}
const inheritedPixels = Object.values(old.assets).reduce((sum, a) => sum + a.width * a.height, 0);
const newPixels = pages.reduce((sum, p) => sum + size * 4 * size * Math.ceil(p.slots.length / 4), 0);
assert(inheritedPixels + newPixels <= limit, `Atlas pixel budget exceeded: ${inheritedPixels + newPixels}`);
// Refuse to overwrite any previous candidate; callers must explicitly choose a new revision.
await mkdir(out);
const assetDir = join(out, 'public/assistant', version);
await mkdir(assetDir, { recursive: true }); await mkdir(join(out, 'review'));
const assets = structuredClone(old.assets), decodedNew = new Map(), exported = [];
for (const page of pages) {
  const width = size * 4, height = size * Math.ceil(page.slots.length / 4), raw = Buffer.alloc(width * height * 4);
  for (const frame of page.slots) for (let y = 0; y < size; y++) {
    frame.pixels.copy(raw, ((frame.y + y) * width + frame.x) * 4, y * size * 4, (y + 1) * size * 4);
  }
  const filename = `${page.key}.webp`, path = join(assetDir, filename);
  await sharp(raw, { raw: { width, height, channels: 4 } }).webp({ lossless: true, effort: 3 }).toFile(path);
  const bytes = await readFile(path), data = await decode(bytes, width, height);
  assets[page.key] = { src: `/assistant/${version}/${filename}`, width, height, sha256: sha(bytes), alpha: true };
  decodedNew.set(page.key, { data, width, height });
  exported.push({ key: page.key, sha256: sha(bytes), bytes: bytes.length, width, height, uniqueFrames: page.slots.length });
}
const verified = [];
for (const action of ['bow', 'thinking']) for (const [index, frame] of clips[action].frames.entries()) {
  const page = decodedNew.get(frame.asset) ?? oldPages.get(frame.asset);
  const actual = crop(page, frame), expected = rawFrames.get(`${action}:${index}`);
  assert(actual.equals(expected), `Encoded crop differs: ${action}/${index}`);
  assert.equal(naturalRgbaHash(actual), frame.rgbaSha256);
  verified.push({ action, index, rgbaSha256: frame.rgbaSha256 });
}
const manifest = { version, width: size, height: size, anchorRgbaSha256: old.anchorRgbaSha256, still: structuredClone(old.still),
  review: { art: 'PENDING', technical: 'PENDING', transitions: 'PENDING', report: 'review/release-review.json' }, assets, clips };
assert(validNaturalRuntime(manifest), 'Candidate runtime structure invalid');
assert.equal(validNaturalMotion(manifest), false, 'Candidate must not claim approval');
assert.deepEqual(manifest.clips.idle, old.clips.idle); assert.deepEqual(manifest.clips.wave, old.clips.wave);
assert.deepEqual(manifest.still, old.still);
const scope = naturalManifestScope(manifest), pending = { status: 'PENDING', reviewer: null, reviewedAt: null, evidence: [] };
const review = { manifestVersion: version, manifestScopeSha256: scope, art: { ...pending }, technical: { ...pending }, transitions: { ...pending },
  warning: 'Inherited pixels are unchanged, but no previous artistic or deployment approval is carried onto this release. Optical-flow transition drawings require separate visual and browser review.' };
const report = { status: 'AUTOMATED_PIXEL_CHECKS_PASSED_NOT_RELEASE_APPROVAL', createdAt: new Date().toISOString(),
  productionAllowed: false, productionChanged: false, manifestVersion: version, manifestScopeSha256: scope,
  inheritedManifest: { path: relative(root, oldPath).replaceAll('\\', '/'), sha256: sha(oldBytes) },
  transitionReportSha256: sha(transitionBytes), inheritedAssetsVerified: inherited, inheritedClipsByteEquivalent: ['idle', 'wave'],
  pageLayout: '4x4 fixed480px lossless WebP; inherited asset URLs unchanged; global RGBA deduplication including inherited slots',
  newAssets: exported, newEncodedBytes: exported.reduce((sum, a) => sum + a.bytes, 0),
  decodedLibraryPixels: inheritedPixels + newPixels, decodedLibraryPixelLimit: limit, inheritedPixels, newPixels,
  actualEndpointsPixelExact: true, actualDecodedFramesVerified: verified.length, frameScopeSha256: sha(JSON.stringify(verified)),
  motions: Object.fromEntries(['bow', 'thinking'].map(action => [action, { frames: clips[action].frames.length, durationMs: clips[action].frames.reduce((sum, f) => sum + f.durationMs, 0) }])),
  sources, limitations: ['No art or browser transition approval', 'No production files changed', 'Staging contains only new pages; preview must resolve inherited assets from the original public directory'] };
await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(join(out, 'review/release-review.json'), JSON.stringify(review, null, 2) + '\n');
await writeFile(join(out, 'review/technical.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, manifest: join(out, 'manifest.json'), scope, newPages: exported.length,
  newBytes: report.newEncodedBytes, pixels: report.decodedLibraryPixels, motions: report.motions, reviewed: false }));
