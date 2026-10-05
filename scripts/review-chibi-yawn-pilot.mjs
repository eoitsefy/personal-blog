import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const base = 'docs/assistant/art-pilot-v6', out = base + '/followup-yawn';
const provenance = JSON.parse(await readFile(out + '/provenance.json', 'utf8'));
const neutral = await sharp(base + '/reference/neutral-clean.png').ensureAlpha().raw().toBuffer();
const scope = createHash('sha256'), frames = [];
for (let i = 0; i < 21; i++) {
  const path = `${out}/frames/${String(i).padStart(3, '0')}.png`;
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 768); assert.equal(info.height, 768);
  for (let y = 0; y < 768; y++) for (let x = 0; x < 768; x++) {
    const p = (y * 768 + x) * 4;
    assert.equal(data[p + 3], neutral[p + 3], `frame ${i}: changed silhouette`);
    const editable = provenance.masks.some(([cx, cy, rx, ry, minY]) => y >= minY && Math.hypot((x - cx) / rx, (y - cy) / ry) < 1);
    if (!editable) assert.deepEqual(data.subarray(p, p + 4), neutral.subarray(p, p + 4), `frame ${i}: changed identity`);
  }
  if (i === 0 || i === 20) assert.deepEqual(data, neutral);
  const hash = createHash('sha256').update(data).digest('hex'); scope.update(`${i}:${hash}\n`);
  frames.push({ index: i, rgbaSha256: hash });
}
for (let start = 0; start < 21; start += 12) {
  const tiles = await Promise.all(frames.slice(start, start + 12).map(async ({ index }, i) => ({
    input: await sharp(`${out}/frames/${String(index).padStart(3, '0')}.png`).extract({ left: 300, top: 300, width: 165, height: 88 }).resize(330, 176).png().toBuffer(),
    left: i % 3 * 330, top: Math.floor(i / 3) * 176,
  })));
  await sharp({ create: { width: 990, height: Math.ceil(tiles.length / 3) * 176, channels: 4, background: '#f4f1e9' } })
    .composite(tiles).png().toFile(`${out}/review/face-${start}.png`);
}
await writeFile(out + '/review/technical.json', JSON.stringify({ technicalPassed: true, frames, rgbaScopeSha256: scope.digest('hex'),
  silhouetteUnchanged: true, fixedFeet: true, outsideExpressionsUnchanged: true, originalEndpoints: true,
  independentlyDrawnKeys: 4, browserReview: 'pending', deploymentAllowed: false }, null, 2) + '\n');
console.log('Yawn pilot technical gate passed; not a production approval');
