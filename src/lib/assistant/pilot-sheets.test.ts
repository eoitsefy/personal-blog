import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import { PILOT_SHEETS } from "./pilot-sheets";
import { LEFT_COLLAR_SHEETS } from "./left-collar-sheets";
import { CHARACTER_FRAME_VERSION, drawingDuration, drawingTimes, DRAWING_SEQUENCES, NEUTRAL_DRAWING } from "./frame-timeline";

const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
function visiblePixelsEqual(actual: Buffer, expected: Buffer) {
  assert.equal(actual.length, expected.length);
  for (let p = 0; p < actual.length; p += 4) {
    assert.equal(actual[p + 3], expected[p + 3]);
    if (expected[p + 3]) assert.deepEqual(actual.subarray(p, p + 3), expected.subarray(p, p + 3));
  }
}

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
    // Freeze historical v6 resources; never substitute a newer runtime wave.
    const asset = manifest.assets[action];
    const source = await readFile(`public${asset.src}`);
    assert.equal(createHash("sha256").update(source).digest("hex"), asset.sha256);
    const metadata = await sharp(source).metadata();
    assert.equal(metadata.hasAlpha, true); assert.equal(metadata.pages ?? 1, 1);
    assert.equal(metadata.width, asset.width); assert.equal(metadata.height, asset.height);
    for (const [index, sourceIndex] of asset.sourceIndices.entries()) {
      const x = index % asset.columns * 366, y = Math.floor(index / asset.columns) * 460;
      const actual = await sharp(source).extract({ left: x, top: y, width: 366, height: 460 }).ensureAlpha().raw().toBuffer();
      const expected = await sharp(`${base}frames/${action}/${String(sourceIndex).padStart(3, "0")}.png`)
        .extract(manifest.rect).ensureAlpha().raw().toBuffer();
      visiblePixelsEqual(actual, expected);
    }
  }
});

test("left-collar release retains historical assets and changes only the accepted wave timeline", () => {
  assert.equal(CHARACTER_FRAME_VERSION, "original-left-collar-kling-wave-v1");
  assert.deepEqual(NEUTRAL_DRAWING, { sheet: "pilot-blink", frame: 0 });
  assert.equal(PILOT_SHEETS["pilot-blink"].src, "/assistant/chibi-blink-pilot-v6.webp");
  assert.equal(PILOT_SHEETS["pilot-wave"].src, "/assistant/chibi-wave-reviewed-v16.webp");
  assert.equal(PILOT_SHEETS["pilot-wave"].poses.length, 37);
  assert.equal(PILOT_SHEETS["pilot-wave"].width, 2196); assert.equal(PILOT_SHEETS["pilot-wave"].height, 3220);
  assert.equal(LEFT_COLLAR_SHEETS["pilot-blink"].src, "/assistant/chibi-idle-left-collar-v4.webp");
  assert.equal(DRAWING_SEQUENCES.idle.length, 68); assert.equal(DRAWING_SEQUENCES.wave.length, 121);
  assert.deepEqual(DRAWING_SEQUENCES.wave.slice(1, -1), Array.from({ length: 119 }, (_, i) => ({ sheet: "kling-wave", frame: i + 1 })));
  assert.equal(drawingDuration("idle"), 4000); assert.equal(drawingDuration("wave"), 121 / 24 * 1000);
  assert.equal(drawingTimes("wave").at(-1), 5000);
  assert.deepEqual(Object.fromEntries(Object.entries(DRAWING_SEQUENCES).map(([action, frames]) => [action, frames.length])),
    { idle: 68, wave: 121, nod: 14, thinking: 28, bow: 20, cheer: 17, yawn: 34 });
});

test("v16 runtime atlas is hash-bound to full approved PNGs, provenance and strict final art/browser gates", async () => {
  const base = "docs/assistant/wave-keyframes-v16/";
  const runtime = JSON.parse(await readFile(base + "runtime-manifest.json", "utf8"));
  // Import the offline validators only in this test, never into the browser UI.
  const modulePath = "../../../scripts/animation/pipeline.mjs";
  const { parseManifest, manifestScope, keyScope, deriveProvenance, validateFinalApproval, validateKeyApproval, validatePlaybackReport } = await import(modulePath);
  const manifest = parseManifest(JSON.parse(await readFile(base + "manifest.json", "utf8")));
  assert.equal(runtime.status, "APPROVED_FOR_RELEASE"); assert.equal(runtime.artReview, "APPROVED_FOR_RELEASE");
  assert.equal(runtime.technicalStatus, "PASSED_TECHNICAL_ONLY"); assert.equal("ownerAcceptance" in runtime, false);
  assert.equal(runtime.manifestScopeSha256, manifestScope(manifest));
  assert.equal(runtime.fps, 15); assert.equal(runtime.loopDurationMs, 3000); assert.equal(runtime.staticAtlas, true); assert.equal(runtime.noCrossfade, true);
  assert.deepEqual(runtime.rect, { left: 180, top: 153, width: 366, height: 460 });
  assert.deepEqual(runtime.sourceAnchor, { x: 384, y: 608 }); assert.equal(runtime.scale, PILOT_SHEETS["pilot-wave"].scale);
  assert.equal("independentDrawings" in runtime, false);
  for (const [field, count] of Object.entries(deriveProvenance(manifest))) assert.equal(runtime[field], count);
  const reference = await sharp(manifest.reference.file).ensureAlpha().raw().toBuffer();
  const mask = await sharp(manifest.editableMask.file).ensureAlpha().raw().toBuffer();
  const keys = await Promise.all(manifest.keys.map(async (key: { file: string }) => sharp(key.file).ensureAlpha().raw().toBuffer()));
  assert.equal(runtime.keyScopeSha256, keyScope(hash(reference), keys.map(hash), hash(mask), runtime.manifestScopeSha256));
  validateKeyApproval(runtime.keyApproval, runtime.keyScopeSha256);
  const sourceRgbaHashes: string[] = [];
  const asset = runtime.assets.wave, sheet = PILOT_SHEETS["pilot-wave"];
  assert.equal(asset.src, sheet.src); assert.equal(asset.width, sheet.width); assert.equal(asset.height, sheet.height);
  assert.equal(asset.columns, 6); assert.equal(asset.frames, 37); assert.deepEqual(asset.sourceIndices, Array.from({ length: 37 }, (_, i) => i));
  const bytes = await readFile(`public${asset.src}`), metadata = await sharp(bytes).metadata();
  assert.equal(bytes.length, asset.bytes); assert.equal(hash(bytes), asset.sha256);
  assert.equal(metadata.pages ?? 1, 1); assert.equal(metadata.hasAlpha, true);
  assert.equal(metadata.width, 2196); assert.equal(metadata.height, 3220);
  for (let i = 0; i < 37; i++) {
    const png = await readFile(`${base}frames/${String(i).padStart(3, "0")}.png`);
    assert.equal(hash(png), runtime.repositorySourcePngSha256[i]);
    const data = await sharp(png, { limitInputPixels: 768 * 768 }).ensureAlpha().raw().toBuffer();
    assert.equal(data.length, 768 * 768 * 4); sourceRgbaHashes.push(hash(data));
    const keyIndex = Math.min(i, 36 - i); assert.ok(data.equals(keys[keyIndex]), "Every slot must retain its exact approved prepared PNG pixels");
    let staticChanges = 0, clippedPixels = 0;
    for (let p = 0; p < 768 * 768; p++) {
      const offset = p * 4, x = p % 768, y = Math.floor(p / 768);
      if (mask[offset + 3] < 128 && (data[offset] !== reference[offset] || data[offset + 1] !== reference[offset + 1] || data[offset + 2] !== reference[offset + 2] || data[offset + 3] !== reference[offset + 3])) staticChanges++;
      if ((x < 180 || x >= 546 || y < 153 || y >= 613) && data[offset + 3] !== 0) clippedPixels++;
    }
    assert.equal(staticChanges, 0, "Protected head, torso and soles changed"); assert.equal(clippedPixels, 0, "Fixed runtime crop omits artwork");
    const [x, y, right, bottom, anchorX, anchorY] = sheet.poses[i];
    assert.deepEqual([right - x + 1, bottom - y + 1, anchorX - x, anchorY - y], [366, 460, 204, 455]);
    const actual = await sharp(bytes).extract({ left: x, top: y, width: 366, height: 460 }).ensureAlpha().raw().toBuffer();
    const expected = await sharp(png).extract(runtime.rect).ensureAlpha().raw().toBuffer();
    visiblePixelsEqual(actual, expected);
  }
  assert.deepEqual(sourceRgbaHashes, asset.sourceRgbaHashes); assert.equal(hash(sourceRgbaHashes.join("")), runtime.frameScopeSha256);
  const scopes = { manifestScopeSha256: runtime.manifestScopeSha256, keyScopeSha256: runtime.keyScopeSha256, frameScopeSha256: runtime.frameScopeSha256 };
  validateFinalApproval(runtime.finalApproval, scopes);
  const finalApproval = await readFile(manifest.review.finalApproval);
  assert.equal(hash(finalApproval), runtime.finalApprovalSha256); assert.deepEqual(JSON.parse(finalApproval.toString("utf8")), runtime.finalApproval);
  validatePlaybackReport(runtime.playback, { ...scopes, frameCount: 37, sourcePngSha256: runtime.sourcePngSha256, technicalStatus: "PASSED_TECHNICAL_ONLY" });
  assert.equal(runtime.delayMs.length, 37); assert.equal(runtime.delayMs.reduce((sum: number, delay: number) => sum + delay, 0), 3000);
  assert.equal(runtime.runtimeDelayMs.length, 37); assert.ok(Math.abs(runtime.runtimeDelayMs.at(-1) - 600) < 1e-8);
  const blank = await sharp(bytes).extract({ left: 366, top: 2760, width: 1830, height: 460 }).ensureAlpha().raw().toBuffer();
  for (let p = 3; p < blank.length; p += 4) assert.equal(blank[p], 0, "Unused atlas cells contain neighbouring art");
  const neutral = await sharp(`public${PILOT_SHEETS["pilot-blink"].src}`).extract({ left: 0, top: 0, width: 366, height: 460 }).ensureAlpha().raw().toBuffer();
  for (const index of [0, 36]) {
    const [x, y] = sheet.poses[index];
    visiblePixelsEqual(await sharp(bytes).extract({ left: x, top: y, width: 366, height: 460 }).ensureAlpha().raw().toBuffer(), neutral);
  }
});
