// Offline reference preparation only. Never changes production artwork.
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'docs/assistant/art-pilot-v6');
await mkdir(resolve(out, 'reference'), { recursive: true });
const source = resolve(root, 'public/assistant/chibi-idle-v4.png');
const sourceBytes = await readFile(source);
const expected = '586873ef3390d5b4df1b698cb185088508cd03292a24c4915e16993b186266d5';
if (createHash('sha256').update(sourceBytes).digest('hex') !== expected) throw Error('Original reference changed');

// A single registered original neutral pose; one scale, one fixed stage.
// No per-frame auto crop, stretch, limb rigging, or new character drawing.
const crop = { left: 44, top: 23, width: 239, height: 380 };
const stage = 768;
const scale = 450 / 375;
const anchor = { x: 384, y: 608 };
const foreground = await sharp(sourceBytes).extract(crop)
  .resize(Math.round(crop.width * scale), Math.round(crop.height * scale), { kernel: 'lanczos3' }).png().toBuffer();
const left = Math.round(anchor.x - (167.5 - crop.left) * scale);
const top = Math.round(anchor.y - (399 - crop.top) * scale);
const target = resolve(out, 'reference/neutral.png');
await sharp({ create: { width: stage, height: stage, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: foreground, left, top }]).png().toFile(target);
const metadata = {
  status: 'offline-only-not-approved', stage: { width: stage, height: stage, safetyInset: .2, anchor },
  original: { file: 'public/assistant/chibi-idle-v4.png', sha256: expected, pose: 0, crop, scale },
  reference: 'reference/neutral.png', registration: { left, top },
  method: 'Single uniform resample of original full-figure pose; no layered renderer',
};
await writeFile(resolve(out, 'reference/registration.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify({ target, ...metadata }, null, 2));
