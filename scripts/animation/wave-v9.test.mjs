import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { AnimationPipeline, deriveMotion, sha256, validateKeyApproval, validateFinalApproval } from './pipeline.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pack = resolve(root, 'docs/assistant/wave-keyframes-v9');
const json = async file => JSON.parse(await readFile(resolve(pack, file), 'utf8'));
const load = () => AnimationPipeline.load(resolve(pack, 'manifest.json'));

test('v9 provenance counts actual source edits, not interpolated frames or reused drawings', async () => {
  const prompts = await json('prompts.json'), audit = await json('review/automatic.json');
  assert.equal(prompts.requests.length, 4);
  assert.equal(prompts.requests.filter(item => item.selected).length, 2);
  assert.equal(audit.newIndependentDrawings, 2);
  assert.equal(audit.reusedIndependentDrawings, 5);
  assert.equal(audit.generatedOutputs, 4);
  assert.equal(audit.rejectedGeneratedOutputs, 2);
  for (const request of prompts.requests) {
    assert.ok(request.prompt.length > 100); assert.equal(request.transparentBackground, true);
    assert.ok(request.referencedImagePaths.length);
    const metadata = await sharp(await readFile(resolve(pack, request.resultFile))).metadata();
    assert.equal(metadata.format, 'png'); assert.equal(metadata.hasAlpha, true);
    for (const reference of request.referencedImagePaths) assert.ok((await readFile(resolve(root, reference))).length);
  }
});

test('v9 exact original neutral, protected static pixels and seven scoped key drawings remain intact', async () => {
  const pipeline = await load(), audit = await json('review/automatic.json');
  assert.equal(pipeline.keys.length, 7); assert.equal(pipeline.manifest.motion.fps, 15);
  assert.equal(pipeline.keys[0].equals(pipeline.reference), true);
  assert.deepEqual(pipeline.keys.map(sha256), audit.keyRgbaSha256);
  assert.equal(sha256(Buffer.from(pipeline.keys.map(sha256).join(''))), audit.keyOnlyScopeSha256);
  for (const [i, data] of pipeline.keys.entries()) {
    const measure = pipeline.measure(data, i);
    assert.equal(measure.staticChanges, 0); assert.equal(measure.safeMargins, true);
    assert.equal(measure.passed, true);
  }
  const approval = validateKeyApproval(await json('review/key-approval.json'), pipeline.keyScopeSha256);
  assert.equal(approval.releaseAllowed, false);
});

test('v9 all 37 PNGs, exact key nodes and three-second timing match the frozen rejected reports', async () => {
  const pipeline = await load(), interpolation = await json('review/interpolation.json');
  const technical = await json('review/technical.json'), visual = await json('review/visual.json');
  const motion = deriveMotion(pipeline.manifest);
  assert.equal(motion.frameCount, 37); assert.equal(motion.delayMs.at(-1), 588);
  assert.equal(motion.delayMs.reduce((a, b) => a + b, 0), 3000);
  assert.deepEqual(interpolation.delayMs, motion.delayMs);
  assert.equal(interpolation.independentDrawings, 7);
  const files = (await readdir(resolve(pack, 'frames'))).sort();
  assert.deepEqual(files, Array.from({ length: 37 }, (_, i) => String(i).padStart(3, '0') + '.png'));
  const hashes = [];
  for (const [i, file] of files.entries()) {
    const data = await sharp(resolve(pack, 'frames', file)).ensureAlpha().raw().toBuffer();
    hashes.push(sha256(data));
    assert.equal(pipeline.measure(data, i).staticChanges, 0);
    assert.equal(pipeline.measure(data, i).safeMargins, true);
    if (i % 3 === 0) assert.equal(data.equals(pipeline.keys[motion.keyIndices[i / 3]]), true);
  }
  assert.deepEqual(hashes, interpolation.frameHashes);
  const scope = sha256(Buffer.from(hashes.join('')));
  for (const report of [interpolation, technical, visual]) {
    assert.equal(report.manifestScopeSha256, pipeline.manifestScopeSha256);
    assert.equal(report.keyScopeSha256, pipeline.keyScopeSha256);
    assert.equal(report.frameScopeSha256, scope);
    assert.equal(report.releaseAllowed, false);
  }
  assert.equal(technical.status, 'REJECTED_TECHNICAL'); assert.equal(visual.status, 'REJECTED');
  assert.deepEqual(technical.measures.filter(m => !m.passed).map(m => m.index), [1, 14, 16, 17, 22, 35]);
});

test('v9 playback success cannot promote rejected art or reuse the older owner exception', async () => {
  const pipeline = await load(), playback = await json('review/playback.json');
  assert.equal(playback.status, 'PASSED_PLAYBACK_ONLY');
  assert.equal(playback.technicalStatus, 'REJECTED_TECHNICAL');
  const sourceHashes = await Promise.all(Array.from({ length: 37 }, async (_, i) => sha256(await readFile(resolve(pack, 'frames', String(i).padStart(3, '0') + '.png')))));
  assert.deepEqual(sourceHashes, playback.sourcePngSha256);
  for (const mode of playback.modes) {
    assert.equal(mode.framesVisited, 37); assert.equal(mode.sourcePngHashesVerified, 37);
    assert.ok(mode.cycles >= 1); assert.deepEqual(mode.pixelMismatchFrames, []);
  }
  assert.deepEqual(playback.modes.map(m => m.speed), [1, .5]);
  assert.equal(playback.paused, true); assert.equal(playback.reducedMotionPaused, true);
  assert.equal(playback.mobileOverflow, false); assert.deepEqual(playback.errors, []);
  assert.deepEqual(playback.externalRequests, []); assert.equal(playback.releaseAllowed, false);
  await assert.rejects(readFile(resolve(pack, 'review/final-approval.json')), { code: 'ENOENT' });
  assert.throws(() => validateFinalApproval(playback, playback));
  assert.throws(() => validateFinalApproval({ status: 'REJECTED', releaseAllowed: false }, playback));
  assert.equal((await json('review/shared-warp-experiment.json')).status, 'REJECTED_TECHNICAL_AND_VISUAL');
  assert.equal(pipeline.manifest.review.finalApproval, 'docs/assistant/wave-keyframes-v9/review/final-approval.json');
});
