// Owner acceptance is separate from, and never changes, the rejected art review.
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'docs/assistant/art-pilot-v6');
const json = async name => JSON.parse(await readFile(resolve(source, name), 'utf8'));
const owner = await json('owner-acceptance.json'), review = await json('review/automatic.json');
assert.equal(owner.decision, 'OWNER_ACCEPTED_WITH_KNOWN_ART_DEFECTS');
assert.equal(owner.changesVisualReviewResult, false);
assert.equal(owner.artScopeSha256, review.artScopeSha256);
assert.ok(review.automatic.every(action => action.passed));
assert.deepEqual(owner.scope, ['blink', 'wave']);
const scope = createHash('sha256'), assets = {};
// ONE fixed rectangle for every pose in both actions. It only removes unused
// transparent gutters; no per-frame crop, fit, scale or character movement.
const rect = { left: 180, top: 153, width: 366, height: 460 };
for (const [action, count, columns] of [['blink', 17, 3], ['wave', 61, 6]]) {
  const frames = [], hashes = [];
  for (let i = 0; i < count; i++) {
    const path = resolve(source, 'frames', action, String(i).padStart(3, '0') + '.png');
    const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 768); assert.equal(info.height, 768);
    const hash = createHash('sha256').update(data).digest('hex');
    scope.update(`${action}:${i}:${hash}\n`);
    // A common runtime crop must never omit any nonzero-alpha source pixel.
    for (let y = 0; y < 768; y++) for (let x = 0; x < 768; x++) {
      if (x < rect.left || x >= rect.left + rect.width || y < rect.top || y >= rect.top + rect.height)
        assert.equal(data[(y * 768 + x) * 4 + 3], 0, `${action}/${i}: crop clips artwork`);
    }
    if (i % 2 === 0) {
      frames.push(await sharp(path).extract(rect).ensureAlpha().raw().toBuffer());
      hashes.push(hash);
    }
  }
  const width = columns * rect.width, height = Math.ceil(frames.length / columns) * rect.height;
  const src = `/assistant/chibi-${action}-pilot-v6.webp`;
  // Exact RGBA row copies avoid rounding in premultiplied-alpha compositing.
  const atlas = Buffer.alloc(width * height * 4);
  for (let i = 0; i < frames.length; i++) for (let y = 0; y < rect.height; y++) {
    const left = i % columns * rect.width, top = Math.floor(i / columns) * rect.height;
    frames[i].copy(atlas, ((top + y) * width + left) * 4, y * rect.width * 4, (y + 1) * rect.width * 4);
  }
  await sharp(atlas, { raw: { width, height, channels: 4 } })
    .webp({ lossless: true, effort: 6 }).toFile(resolve(root, 'public' + src));
  const bytes = await readFile(resolve(root, 'public' + src));
  assets[action] = { src, width, height, columns, frames: frames.length, sourceIndices: hashes.map((_, i) => i * 2),
    sourceRgbaHashes: hashes, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
assert.equal(scope.digest('hex'), owner.artScopeSha256, 'Source frames changed; owner acceptance is stale');
const manifest = { schemaVersion: 1, status: owner.decision, artReview: review.status,
  ownerAcceptance: owner, fps: 15, staticAtlas: true, rect, sourceAnchor: { x: 384, y: 608 },
  scale: 0.553763440860215 / 1.2, assets, noCrossfade: true };
await writeFile(resolve(source, 'runtime-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ status: manifest.status, artReview: manifest.artReview, assets }, null, 2));
