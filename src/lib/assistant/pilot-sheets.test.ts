import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import { PILOT_SHEETS } from "./pilot-sheets";
import { drawingDuration, drawingTimes, DRAWING_SEQUENCES, NEUTRAL_DRAWING } from "./frame-timeline";

test("v6 owner authorization is explicit and does not relabel failed art as passed", async () => {
  const base = "docs/assistant/art-pilot-v6/";
  const manifest = JSON.parse(await readFile(base + "runtime-manifest.json", "utf8"));
  const visual = JSON.parse(await readFile(base + "review/visual.json", "utf8"));
  assert.equal(manifest.status, "OWNER_ACCEPTED_WITH_KNOWN_ART_DEFECTS");
  assert.equal(visual.status, "REJECTED_ART"); assert.equal(visual.actions.wave.status, "REJECTED");
  assert.equal(manifest.ownerAcceptance.artScopeSha256, visual.artScopeSha256);
  assert.equal(manifest.ownerAcceptance.changesVisualReviewResult, false);
  assert.equal(manifest.ownerAcceptance.authorizesFutureUnreviewedActions, false);
  assert.deepEqual(manifest.ownerAcceptance.scope, ["blink", "wave"]);
  assert.equal(manifest.fps, 15); assert.equal(manifest.noCrossfade, true);
});

test("v6 static atlas tiles are lossless fixed crops of the accepted 15 fps samples", async () => {
  const base = "docs/assistant/art-pilot-v6/";
  const manifest = JSON.parse(await readFile(base + "runtime-manifest.json", "utf8"));
  for (const action of ["blink", "wave"] as const) {
    const asset = manifest.assets[action], sheet = PILOT_SHEETS[`pilot-${action}`];
    const source = await readFile(`public${sheet.src}`);
    assert.equal(createHash("sha256").update(source).digest("hex"), asset.sha256);
    const metadata = await sharp(source).metadata();
    assert.equal(metadata.hasAlpha, true); assert.equal(metadata.pages ?? 1, 1);
    assert.equal(metadata.width, sheet.width); assert.equal(metadata.height, sheet.height);
    for (const [index, sourceIndex] of asset.sourceIndices.entries()) {
      const [x, y] = sheet.poses[index];
      const actual = await sharp(source).extract({ left: x, top: y, width: 366, height: 460 }).ensureAlpha().raw().toBuffer();
      const expected = await sharp(`${base}frames/${action}/${String(sourceIndex).padStart(3, "0")}.png`)
        .extract(manifest.rect).ensureAlpha().raw().toBuffer();
      // WebP may discard invisible RGB, never visible colour or alpha.
      for (let p = 0; p < actual.length; p += 4) {
        assert.equal(actual[p + 3], expected[p + 3]);
        if (expected[p + 3]) assert.deepEqual(actual.subarray(p, p + 3), expected.subarray(p, p + 3));
      }
    }
  }
  assert.deepEqual(NEUTRAL_DRAWING, { sheet: "pilot-blink", frame: 0 });
  assert.equal(DRAWING_SEQUENCES.idle.length, 9); assert.equal(DRAWING_SEQUENCES.wave.length, 31);
  assert.equal(drawingDuration("idle"), 4000); assert.equal(drawingDuration("wave"), 3000);
  assert.ok(Math.abs(drawingTimes("wave").at(-1)! - 2000) < 1e-8);
});
