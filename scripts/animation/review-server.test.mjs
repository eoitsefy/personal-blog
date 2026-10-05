import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { startReviewServer } from './review-server.mjs';
import { sha256 } from './pipeline.mjs';

async function fixture() {
  const base = process.platform === 'win32' ? 'D:/CodexTools/assistant-animation/jobs/test-fixtures' : tmpdir();
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(resolve(base, 'viewer-'));
  await mkdir(resolve(root, 'frames'));
  await writeFile(resolve(root, 'preview.html'), '<p>offline review</p>');
  for (let i = 0; i < 3; i++) await writeFile(resolve(root, `frames/00${i}.png`), `unit PNG ${i}`);
  const playback = { status: 'PASSED_PLAYBACK_ONLY', technicalStatus: 'REJECTED_TECHNICAL',
    manifestScopeSha256: 'a'.repeat(64), keyScopeSha256: 'b'.repeat(64), frameScopeSha256: 'c'.repeat(64),
    sourcePngSha256: await Promise.all([0, 1, 2].map(async i => sha256(await readFile(resolve(root, `frames/00${i}.png`))))),
    modes: [1, .5].map(speed => ({ speed, framesVisited: 3, cycles: 1, sourcePngHashesVerified: 3, pixelMismatchFrames: [] })),
    paused: true, reducedMotionPaused: true, mobileOverflow: false, errors: [], externalRequests: [], releaseAllowed: false };
  const manifest = { schemaVersion: 1, id: 'viewer-unit', action: 'wave',
    reference: { file: 'ref.png', sha256: 'a'.repeat(64) }, editableMask: { file: 'mask.png', sha256: 'a'.repeat(64) },
    keys: ['neutral', 'pose'].map(id => ({ id, file: id + '.png', sha256: 'a'.repeat(64) })),
    canvas: { width: 64, height: 64, safetyInset: .2 }, motion: { sequence: ['neutral', 'pose', 'neutral'], stepsPerInterval: 1, fps: 15, loopDurationMs: 1000 },
    interpolation: { method: 'hold', gpu: 1 }, review: { keyApproval: 'key.json', finalApproval: 'final.json' } };
  const pipeline = { manifest, manifestScopeSha256: 'a'.repeat(64), keyScopeSha256: 'b'.repeat(64),
    status: async () => ({ stages: { preview: { artifacts: [{ file: 'preview.html', sha256: sha256(await readFile(resolve(root, 'preview.html'))) }] } } }),
    receiptValid: async () => true,
    readJson: async name => name === 'playback.json' ? playback : name === 'technical.json' ? { status: 'REJECTED_TECHNICAL' } : { frameScopeSha256: 'c'.repeat(64) },
    output: async file => resolve(root, file) };
  return { root, playback, pipeline };
}

test('review viewer serves only approved-scope preview files over loopback, never APIs or arbitrary paths', async () => {
  const f = await fixture(), viewer = await startReviewServer(f.pipeline);
  try {
    assert.equal(viewer.server.address().address, '127.0.0.1');
    assert.equal(viewer.releaseAllowed, false);
    const home = await fetch(viewer.origin);
    assert.equal(home.status, 200); assert.equal(home.headers.get('cache-control'), 'no-store');
    assert.equal(await home.text(), '<p>offline review</p>');
    assert.equal((await fetch(viewer.origin + '/frames/001.png')).status, 200);
    assert.equal((await fetch(viewer.origin + '/frames/001.png', { method: 'HEAD' })).status, 200);
    for (const path of ['/manifest.json', '/key.json', '/api/generate', '/frames/004.png', '/frames/001.png?other=1']) {
      assert.equal((await fetch(viewer.origin + path)).status, 404);
    }
    assert.equal((await fetch(viewer.origin, { method: 'POST' })).status, 405);
    assert.equal((await fetch(viewer.origin, { headers: { Origin: 'https://other.invalid' } })).status, 403);
    await writeFile(resolve(f.root, 'frames/001.png'), 'changed');
    assert.equal((await fetch(viewer.origin + '/frames/001.png')).status, 409);
  } finally { await viewer.close(); }
});

test('review viewer rejects stale receipts and frame changes before binding a port', async () => {
  const f = await fixture(); f.pipeline.receiptValid = async () => false;
  await assert.rejects(() => startReviewServer(f.pipeline), /browser_playback_not_completed/);
  f.pipeline.receiptValid = async () => true;
  f.playback.frameScopeSha256 = 'old';
  await assert.rejects(() => startReviewServer(f.pipeline), /stale_browser_playback/);
  f.playback.frameScopeSha256 = 'c'.repeat(64);
  await writeFile(resolve(f.root, 'frames/002.png'), 'tampered');
  await assert.rejects(() => startReviewServer(f.pipeline), /stale_or_incomplete_browser_playback/);
});
