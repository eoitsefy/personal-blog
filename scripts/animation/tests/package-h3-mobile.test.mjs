import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { alphaBytes, resizeAtlas, resizeFrame, sha256 } from "../package-h3-mobile.mjs";

test("each 480px slot is cropped before resize; adjacent slots do not bleed", async () => {
  const input = Buffer.alloc(1920 * 960 * 4);
  const colours = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [255, 0, 255], [0, 255, 255], [80, 120, 200], [0, 0, 0]];
  for (let slot = 0; slot < 8; slot++) {
    for (let y = 0; y < 480; y++) for (let x = 0; x < 480; x++) {
      const offset = (((Math.floor(slot / 4) * 480 + y) * 1920) + slot % 4 * 480 + x) * 4;
      input.set([...colours[slot], slot === 7 ? 0 : 255], offset);
    }
  }
  const output = await resizeAtlas(input);
  assert.equal(output.length, 1280 * 640 * 4);
  for (let slot = 0; slot < 8; slot++) {
    for (const [x, y] of [[0, 0], [319, 319], [160, 160]]) {
      const offset = (((Math.floor(slot / 4) * 320 + y) * 1280) + slot % 4 * 320 + x) * 4;
      assert.deepEqual([...output.subarray(offset, offset + 4)], [...colours[slot], slot === 7 ? 0 : 255]);
    }
  }
});

test("Q85 WebP preserves every post-resize alpha value, including translucent pixels", async () => {
  const input = Buffer.alloc(480 * 480 * 4);
  for (let y = 0; y < 480; y++) for (let x = 0; x < 480; x++) input.set([x % 256, y % 256, (x + y) % 256, (x + 3 * y) % 256], (y * 480 + x) * 4);
  const scaled = await resizeFrame(input, 480, 480);
  const encoded = await sharp(scaled, { raw: { width: 320, height: 320, channels: 4 } }).webp({ quality: 85, alphaQuality: 100, effort: 4, exact: true }).toBuffer();
  const decoded = await sharp(encoded).ensureAlpha().raw().toBuffer();
  assert.deepEqual(alphaBytes(decoded), alphaBytes(scaled));
  assert.notEqual(sha256(scaled), sha256(decoded), "RGB is deliberately lossy; do not claim original RGBA identity");
});

test("malformed raw atlas size is rejected", async () => {
  await assert.rejects(resizeAtlas(Buffer.alloc(4)), /Expected values to be strictly equal/);
});
