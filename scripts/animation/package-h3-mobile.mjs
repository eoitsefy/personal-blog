/** Reusable per-frame resizing primitives. The retired 24-scene candidate packager has been removed. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
const FRAME = 320, PAGE_FRAMES = 8;

export const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
export function alphaBytes(rgba) {
  assert.equal(rgba.length % 4, 0);
  const alpha = Buffer.allocUnsafe(rgba.length / 4);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  return alpha;
}

export async function resizeFrame(rgba, width, height, left = 0, top = 0) {
  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract({ left, top, width: 480, height: 480 })
    .resize(FRAME, FRAME, { fit: "fill", kernel: "lanczos3" })
    .ensureAlpha().raw().toBuffer();
}

export async function resizeAtlas(rgba) {
  assert.equal(rgba.length, 1920 * 960 * 4);
  const output = Buffer.alloc(1280 * 640 * 4);
  for (let slot = 0; slot < PAGE_FRAMES; slot++) {
    const tile = await resizeFrame(rgba, 1920, 960, (slot % 4) * 480, Math.floor(slot / 4) * 480);
    for (let row = 0; row < FRAME; row++) {
      const offset = ((Math.floor(slot / 4) * FRAME + row) * 1280 + (slot % 4) * FRAME) * 4;
      tile.copy(output, offset, row * FRAME * 4, (row + 1) * FRAME * 4);
    }
  }
  return output;
}
