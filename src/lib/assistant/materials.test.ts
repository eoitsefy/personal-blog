import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import { CHARACTER_SHEETS, CHARACTER_POSES, CHARACTER_ACTIONS } from "./character";

const manifestPath = "docs/assistant/chibi-v5-inbetween-registration.json";

test("v5 materials remain a separate candidate pack, not a fake 15 fps runtime", async () => {
  const pack = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(pack.status, "candidate-materials-not-runtime");
  assert.equal(pack.authoringFps, 15);
  assert.equal(Object.keys(pack.sheets).length, 9);
  assert.equal(Object.values(pack.sheets).reduce((sum: number, sheet: unknown) => sum + (sheet as { actualFrames: number }).actualFrames, 0), 138);
  assert.equal(pack.review.motionTimeline, "not-integrated-not-accepted");
  assert.equal(pack.sheets.yawn.requestedFrames, 30);
  assert.equal(pack.sheets.yawn.actualFrames, 24);
  assert.deepEqual(pack.sheets.thinking.excludedFrames, [18,19,20,21,22,23]);
  assert.equal(pack.sheets["thinking-recovery"].actualFrames, 12);
  for (const sheet of Object.values(CHARACTER_SHEETS)) assert.ok(sheet.src.endsWith("-v4.png"));
  for (const poses of CHARACTER_POSES) assert.equal(poses.length, 12);
  const component = await readFile("src/components/assistant/chibi-assistant.tsx", "utf8");
  assert.ok(!component.includes("inbetweens-v5"));
  assert.ok(!component.includes("chibi-v5-inbetween-registration"));
});

test("the 84 original source drawings are preserved byte-for-byte", async () => {
  const pack = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const [name, stored] of Object.entries(pack.original.files)) {
    const source = await readFile(`public/assistant/${name}`);
    const evidence = stored as { bytes: number; sha256: string };
    assert.equal(source.byteLength, evidence.bytes);
    assert.equal(createHash("sha256").update(source).digest("hex"), evidence.sha256);
  }
  assert.equal(pack.original.frames, 84);
  assert.equal(Object.keys(CHARACTER_ACTIONS).length, 7);
});

test("all 138 candidate source crops have real alpha, safe bounds and fixed boot anchors", async () => {
  const pack = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const candidate of Object.values(pack.sheets)) {
    const sheet = candidate as {
      src: string; sha256: string; bytes: number; width: number; height: number;
      rows: number; columns: number; actualFrames: number; scale: number;
      poses: { rect: number[]; height: number; pixels: number }[];
    };
    assert.match(sheet.src, /^\/assistant\/chibi-[a-z-]+-inbetweens-v5\.png$/);
    const source = await readFile(`public${sheet.src}`);
    assert.equal(createHash("sha256").update(source).digest("hex"), sheet.sha256);
    assert.equal(source.length, sheet.bytes);
    const metadata = await sharp(source).metadata();
    assert.equal(metadata.hasAlpha, true);
    const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, sheet.width); assert.equal(info.height, sheet.height);
    assert.equal(sheet.poses.length, sheet.actualFrames);
    assert.equal(sheet.rows * sheet.columns, sheet.actualFrames);
    let transparent = 0;
    for (let offset = 3; offset < data.length; offset += 4) if (data[offset] === 0) transparent++;
    assert.ok(transparent / (info.width * info.height) > .3, "A coloured matte is not transparent background");
    for (const [index, pose] of sheet.poses.entries()) {
      const [x,y,right,bottom,anchor] = pose.rect;
      assert.ok([x,y,right,bottom].every(Number.isInteger));
      assert.ok(x >= 0 && y >= 0 && right < info.width && bottom < info.height);
      assert.ok(x < right && y < bottom && anchor >= x && anchor <= right);
      const width = right - x + 1, height = bottom - y + 1;
      assert.equal(height, pose.height);
      assert.ok(pose.pixels > 1000);
      const left = pack.stage.centre - (anchor - x) * sheet.scale;
      const top = pack.stage.baseline - height * sheet.scale;
      assert.ok(top >= 8 && left >= 8 && left + width * sheet.scale <= pack.stage.size - 8, `${sheet.src}/${index}: crop clips the stage`);
      assert.ok(Math.abs(left + (anchor - x) * sheet.scale - pack.stage.centre) < .00001);
      assert.ok(Math.abs(top + height * sheet.scale - pack.stage.baseline) < .00001);
      for (const row of [y - 1, bottom + 1]) {
        if (row < 0 || row >= info.height) continue;
        for (let col = x; col <= right; col++) assert.ok(data[(row * info.width + col) * 4 + 3] <= pack.alphaThreshold, `${sheet.src}/${index}: adjacent-row art leaked`);
      }
      for (const col of [x - 1, right + 1]) {
        if (col < 0 || col >= info.width) continue;
        for (let row = y; row <= bottom; row++) assert.ok(data[(row * info.width + col) * 4 + 3] <= pack.alphaThreshold, `${sheet.src}/${index}: adjacent-column art leaked`);
      }
    }
  }
});
