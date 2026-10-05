import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const out = resolve(root, 'docs/assistant/wave-keyframes-v8');
export const S = 768, SOURCE = 1254, SCALE = S / SOURCE;
export const neutralPath = resolve(out, 'reference/neutral-clean.png');
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const specs = [
  { name: 'prep', file: '01-prep.png', hand: [275,466,56,52] },
  { name: 'opening', file: '03-opening.png', hand: [243,372,55,66] },
  { name: 'peak', file: '04-peak.png', hand: [224,347,69,68] },
];
export const keyFiles = ['00-neutral.png','01-prep.png','02-middle.png','03-opening.png','04-peak.png'];
export function assertKeyApproval(automatic, visual, hashes) {
  const scope = hash(Buffer.from(hashes.join('')));
  if (automatic.artScopeSha256 !== scope || visual.artScopeSha256 !== scope ||
      JSON.stringify(automatic.keyRgbaSha256) !== JSON.stringify(hashes)) throw Error('key_hash_mismatch');
  if (automatic.poses.length !== 3 || automatic.poses.some(pose => !pose.passed)) throw Error('key_technical_rejected');
  if (visual.status !== 'APPROVED_FOR_INTERPOLATION_ONLY' || visual.interpolationAllowed !== true ||
      visual.releaseAllowed !== false) throw Error('key_art_not_approved');
  return scope;
}
export function assertResources(freeDiskBytes, freeMemoryBytes, comfyRunning) {
  if (freeDiskBytes < 8 * 1024 ** 3) throw Error('system_disk_below_8gib');
  if (freeMemoryBytes < 4 * 1024 ** 3) throw Error('physical_memory_below_4gib');
  if (comfyRunning) throw Error('comfy_must_remain_stopped');
}
export function interpolationEditable(x, y, neutral) {
  if (!editable(x, y, neutral)) return false;
  return y >= 400 || specs.some(({ hand: [hx, hy, hw, hh] }) => x >= hx && x < hx + hw && y >= hy && y < hy + hh);
}
export async function readPixels(path) {
  return sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}
export async function register(path) {
  const { data, info } = await readPixels(path);
  if (info.width !== SOURCE || info.height !== SOURCE) throw Error('Unexpected source canvas; shared scale must not silently change');
  let bottom = -1, l = SOURCE, r = -1;
  for (let y = 900; y < SOURCE; y++) for (let x = 450; x < 810; x++)
    if (data[(y * SOURCE + x) * 4 + 3] >= 100) bottom = Math.max(bottom, y);
  if (bottom < 950) throw Error('Sole registration missing');
  for (let y = bottom - 24; y <= bottom; y++) for (let x = 450; x < 810; x++)
    if (data[(y * SOURCE + x) * 4 + 3] >= 100) { l = Math.min(l, x); r = Math.max(r, x); }
  const anchor = { x: (l + r) / 2, y: bottom + 1 };
  const shift = { x: Math.round(384 - anchor.x * SCALE), y: Math.round(608 - anchor.y * SCALE) };
  const scaled = await sharp(path).resize(S,S,{kernel:'lanczos3'}).ensureAlpha().raw().toBuffer();
  const placed = Buffer.alloc(S*S*4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const sx = x - shift.x, sy = y - shift.y;
    if (sx >= 0 && sx < S && sy >= 0 && sy < S)
      scaled.copy(placed,(y*S+x)*4,(sy*S+sx)*4,(sy*S+sx)*4+4);
  }
  return { data: placed, anchor, shift };
}
export function editable(x,y,neutral) {
  if (x < 218 || x >= 346 || y < 345 || y >= 527) return false;
  if (y < 400 && neutral[(y*S+x)*4+3] >= 8) return false;
  return true;
}
export function bake(placed,neutral,hand) {
  const frame = Buffer.from(neutral);
  for (let y=0;y<S;y++) for(let x=0;x<S;x++) {
    if (!editable(x,y,neutral)) continue;
    if (y < 400 && hand) {
      const [hx,hy,hw,hh]=hand;
      if(x<hx||x>=hx+hw||y<hy||y>=hy+hh)continue;
    }
    const p=(y*S+x)*4;
    // Blend only inside solid common cloth, never mix skin with transparency.
    // The wider shoulder replacement avoids v7's flat polygon collar notch.
    let w=x<338?1:(346-x)/8;
    if (w<1 && (neutral[p+3]<245 || placed[p+3]<245)) w=neutral[p+3]>=245?0:1;
    if (!w) continue;
    const a0=neutral[p+3]/255, a1=placed[p+3]/255, a=a0*(1-w)+a1*w;
    for(let c=0;c<3;c++) frame[p+c]=a?Math.round((neutral[p+c]*a0*(1-w)+placed[p+c]*a1*w)/a):0;
    frame[p+3]=Math.round(a*255);
  }
  return frame;
}
